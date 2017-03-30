'use strict'

const cluster = require('cluster')
const fs = require('fs')

const Telegram = require('telegram-node-bot')
const TelegramBaseController = Telegram.TelegramBaseController
const TextCommand = Telegram.TextCommand
const MongooseStorage = require('./MongooseStorage.js')

const mongoose = require('mongoose')
const fast = require('fast.js')
const cron = require('node-cron')
const seneca = require('seneca')()

let mongooseStorage = new MongooseStorage()

const tg = new Telegram.Telegram(require('./token').token, {
    webAdmin: {
      port: 3010,
      host: 'localhost'
    },
    storage: mongooseStorage
  })

if (cluster.isMaster) {
  mongoose.connect('mongodb://localhost/kbpbot')
  let tgApiChain = Promise.resolve(1)
  seneca
  .add('role:tg,cmd:api', function api (msg, respond) {
    tgApiChain = tgApiChain.then(() => {
      tg.api[msg.method].apply(tg.api, msg.args)
      .then(response => {
        console.info('--------\nAPI METHOD ' + msg.method + ' CALLED WITH ARGS ' + JSON.stringify(msg.args) + ':\n' + JSON.stringify(response.chat) + '\n--------')
        return respond(null, {
          response: response
        })
      })
    })
    .then(() => new Promise(resolve => {
      setTimeout(resolve, 2000)
    }))
    .catch(respond)
  })
  .use('ScheduleServices')
  .use('SenderServices', {
    model: mongooseStorage.model
  })
  .listen({
    port: 10102
  })
} else if (cluster.isWorker) {
  seneca
  .client({
    port: 10102
  })
}

// TODO add middlewares
// TODO refactor
// а хотя не, не рефактор, и так работает - зн збс

class ScheduleController extends TelegramBaseController {

  static capsFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1)
  }

  static toStringNumber(num) {
    return (num <= 9) ? '0' + num.toString() : num.toString()
  }

  constructor(config) {
    super()

    config = config || {}

    // var loadSchedule = () => {
    //   return new Promise((resolve, reject) => {
    //     fs.readFile('./timetable.json', 'utf8', (err, data) => {
    //       if (err) return reject(err)
    //       return resolve(data)
    //     })
    //   })
    //   .then((data) => {
    //     this.schedule = JSON.parse(data)
    //     console.log('Timetable reloaded in ' + process.pid)
    //   })
    //   .catch((err) => {
    //     console.log('ERROR in timetable reload:', err.message)
    //     return
    //   })
    // }

    // loadSchedule()

    // cron.schedule('30 11 * * *', loadSchedule)

    this.days = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ']
    this.decDays = ['воскресенье', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу']

    this.info = 'Тут пока нет информации'

    fs.readFile(config.infoPath || 'BOT_INFO.MD', 'utf8', (err, data) => {
      if (err) console.log('information not loaded, fs.readFile fail')
      this.info = data
    })
  }

  handle($, calledDirectly) {
    if (($.message.text !== '/start') && !calledDirectly)
      $.sendMessage('Бот был перезапущен. Команда не сработала, но теперь-то уж точно сработает (конечно, если бот снова не будет перезапущен).')

    new Promise((resolve, reject) => {
      return resolve($.getUserSession('pinnedItem'))
    })
    .then((pinnedItem) => {
      let menuButtons = {}
      let layout = [2, 2, 3]

      if (pinnedItem/*
        && this.schedule[pinnedItem.category]
        && this.schedule[pinnedItem.category][pinnedItem.item]*/) {
        layout = [1, 2, 2, 3]
        let tempText = '📍 ' +
                this.constructor.capsFirst(pinnedItem.category) +
                ' - ' +
                this.constructor.capsFirst(pinnedItem.item)
        menuButtons[tempText] = (choose$) => {
          this.chooseDayInItem(choose$, pinnedItem.category, pinnedItem.item)
        }
      }
      menuButtons['👪 Группы'] = (choose$) => {
        this.chooseItemInCategory(choose$, 'группа')
      }
      menuButtons['👴 Преподаватели'] = (choose$) => {
        this.chooseItemInCategory(choose$, 'преподаватель')
      }
      menuButtons['📚 Предметы'] = (choose$) => {
        this.chooseItemInCategory(choose$, 'предмет')
      }
      menuButtons['🚪 Аудитории'] = (choose$) => {
        this.chooseItemInCategory(choose$, 'аудитория')
      }
      menuButtons['🔧 Настройки'] = (choose$) => {
        this.chooseSetting(choose$)
      }
      menuButtons['❓ Информация'] = (choose$) => {
        this.showInformation(choose$)
      }
      $.runMenu(fast.assign({
        message: 'Главное меню',
        resizeKeyboard: true,
        layout: layout,
        'anyMatch': (choose$) => {
          choose$.sendMessage('Упс, кнопка не найдена. Отмена.')
          .then(() => {
            this.handle(choose$, true)
          })
          .catch(console.log)
          console.log('err', choose$)
        }
      }, menuButtons))
      .catch(console.log)
    })
  }

  chooseItemInCategory($, category) {
    let menuButtons = {}

    menuButtons['⬅️ Меню'] = (choose$) => {
      choose$.sendMessage('Отмена.')
      .then(() => this.handle(choose$, true))
      .catch(console.log)
    }

    seneca
    .act({
      role: 'schedule',
      cmd: 'getCategoryItems',
      category: category
    }, (err, items) => {
      if (err)
        return $.sendMessage('Увы, но произошла следующая ошибка:\n' + err.message)
        .catch(console.log)

      fast.forEach(items, (item, ind) => {
        menuButtons[this.constructor.capsFirst(item)] = (choose$) => {
          this.chooseDayInItem(choose$, category, item)
        }
      })

      $.runMenu(fast.assign({
        message: 'Выберите то, что вам нужно, или введите с клавиатуры (для ввода самому нужна предельная точность)',
        resizeKeyboard: true,
        layout: 3,
        'anyMatch': (choose$) => {
          choose$.sendMessage('Упс, кнопка не найдена. Отмена.')
          .then(() => this.handle(choose$, true))
          .catch(console.log)
        }
      }, menuButtons))
      .catch(console.log)
    })
  }

  chooseDayInItem($, category, item) {
    let menuButtons = {}

    menuButtons['⬅️ Назад'] = (choose$) => {
      this.chooseItemInCategory(choose$, category)
    }

    menuButtons['⬅️ Меню'] = (choose$) => {
      this.handle(choose$, true)
    }

    let currentDay = (new Date()).getDay()

    seneca
    .act({
      role: 'schedule',
      cmd: 'getItemDays',
      category: category,
      item: item
    }, (err, days) => {
      if (err)
        return $.sendMessage('Увы, но произошла следующая ошибка:\n' + err.message)
        .catch(console.log)

      fast.forEach(days, (day, ind) => {
        day = parseInt(day)
        let caption = (currentDay === day) ? '>' + this.days[day] + '<' : this.days[day]
        menuButtons[caption] = (choose$) => {
          this.showDay(choose$, category, item, day.toString())
          this.chooseDayInItem(choose$, category, item)
        }
      })

      $.runMenu(fast.assign({
        message: 'Выберите день недели',
        resizeKeyboard: true,
        layout: [2, 3, 3],
        'anyMatch': (choose$) => {
          choose$.sendMessage('Упс, кнопка не найдена. Назад.')
          .then(() => this.chooseItemInCategory(choose$, category))
          .catch(console.log)
        }
      }, menuButtons))
      .catch(console.log)

    })
  }

  showDay($, category, item, day) {
    seneca
    .act({
      role: 'schedule',
      cmd: 'getDaySchedule',
      category: category,
      item: item,
      day: day
    }, (err, day) => {
      if (err)
        return $.sendMessage('Увы, но произошла следующая ошибка:\n' + err.message)
        .catch(console.log)

      console.log(day)

      $.sendMessage(day.schedule)
      .catch(console.log)
    })
  }

  pinItem($, category) {
    let menuButtons = {
      '⬅️ Назад': (choose$) => {
        choose$.sendMessage('Отмена.')
        .then(() => this.chooseSetting(choose$))
        .catch(console.log)
      },
      '⬅️ Меню': (choose$) => {
        choose$.sendMessage('Отмена.')
        .then(() => this.handle(choose$, true))
        .catch(console.log)
      }
    }

    seneca
    .act({
      role: 'schedule',
      cmd: 'getCategoryItems',
      category: category
    }, (err, items) => {
      if (err)
        return $.sendMessage('Увы, но произошла следующая ошибка:\n' + err.message)
        .catch(console.log)

      fast.forEach(items, (item, ind) => {
        menuButtons[this.constructor.capsFirst(item)] = (choose$) => {
          let pinnedItem = {
            category: category,
            item: item
          }
          choose$.setUserSession('pinnedItem', pinnedItem)
          .then(() => {

            $.getUserSession('sendingTime')
            .then(sendingTime => {
              if (!sendingTime)
                return $.sendMessage('Можете включить уведомления и Вам будет приходить выбранное расписание каждый учебный день. Никакой рекламы!')

              seneca.act({
                role:'sender',
                cmd:'subscribe',
                type:'schedule',
                chatId: $.chatId,
                sendingTime: sendingTime,
                pinnedItem: pinnedItem
              })

              return
            })

            choose$.sendMessage('Расписание закреплено!')
            this.chooseSetting(choose$)
          })
        }
      })

      $.runMenu(fast.assign({
        message: 'Выберите элемент, который хотите закрепить',
        resizeKeyboard: true,
        layout: 3,
        'anyMatch': (choose$) => {
          choose$.sendMessage('Упс, кнопка не найдена. Отмена.')
          .then(() => this.handle(choose$, true))
          .catch(console.log)
        }
      }, menuButtons))
      .catch(console.log)
    })
  }

  unpinItem($) {
    seneca.act({
      role:'sender',
      cmd:'unscribe',
      type:'schedule',
      chatId: $.chatId
    })
    $.setUserSession('pinnedItem', null)
    .then(() => {
      $.sendMessage('Расписание откреплено!')
      .then(() => this.chooseSetting($))
      .catch(console.log)
    })
  }

  chooseSetting($) {

    Promise.all([
      new Promise((resolve, reject) => {
        resolve($.getUserSession('pinnedItem'))
      }),
      new Promise((resolve, reject) => {
        resolve($.getUserSession('sendingTime'))
      })
    ])
    .then(settings => {

      let pinnedItem = settings[0]
      let sendingTime = settings[1]
      let tempText = ''

      let menuButtons = {
        '⬅️ Меню': (choose$) => {
          this.handle(choose$, true)
        }
      }

      let pinItemMenu = {
        message: 'Выберите то, что хотите закрепить',
        resizeKeyboard: true,
        layout: [2, 2, 2, 1],

        '⬅️ Назад': (choose$) => {
          this.chooseSetting(choose$)
        },
        '⬅️ Меню': (choose$) => {
          this.handle(choose$, true)
        },
        '👪 Группа': (choose$) => {
          this.pinItem(choose$, 'группа')
        },
        '👴 Преподаватель': (choose$) => {
          this.pinItem(choose$, 'преподаватель')
        },
        '📚 Предмет': (choose$) => {
          this.pinItem(choose$, 'предмет')
        },
        '🚪 Аудитория': (choose$) => {
          this.pinItem(choose$, 'аудитория')
        },
        '👻 Ничего': (choose$) => {
          this.unpinItem(choose$)
        }
      }

      if (pinnedItem 
        /*&& this.schedule[pinnedItem.category]
        && this.schedule[pinnedItem.category][pinnedItem.item]*/) {

        tempText = '📍 Закреплено: ' +
              this.constructor.capsFirst(pinnedItem.category) +
              ' - ' +
              this.constructor.capsFirst(pinnedItem.item)

        menuButtons[tempText] = pinItemMenu
      } else {
        menuButtons['📌 Закрепить элемент'] = pinItemMenu
      }

      if (sendingTime) {
        tempText = '🔔 Уведомления в ' + 
              this.constructor.toStringNumber(sendingTime.hour) + 
              ':' + 
              this.constructor.toStringNumber(sendingTime.minute) + 
              '. Отключить?'
        menuButtons[tempText] = (choose$) => {
          this.disableNotifications(choose$)
        }
      }
      else {
        tempText = '🔕 Уведомления отключены. Включить?'
        menuButtons[tempText] = (choose$) => {
          this.enableNotifications(choose$)
        }
      }
  
      $.runMenu(fast.assign({
        message: 'Тут можно настроить уведомления и быстрый доступ',
        resizeKeyboard: true,
        layout: [1, 1],
        'anyMatch': (choose$) => {
          choose$.sendMessage('Упс, кнопка не найдена. Отмена.')
          .then(() => this.handle(choose$, true))
          .catch(console.log)
        }
      }, menuButtons))
      .catch(console.log)
    }, console.log)

  }

  disableNotifications($) {
    seneca.act({
      role:'sender',
      cmd:'unscribe',
      type:'schedule',
      chatId: $.chatId
    })
    $.setUserSession('sendingTime', null)
    .then(() => {
      $.sendMessage('Уведомления отключены!')
      this.chooseSetting($)
      return
    })
  }

  enableNotifications($) {

    let _enableNotifications = ($) => {
      let time = $.message.text
      if(/^([0-9]|0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/i.test(time)) {
        time = time.split(':')
        time = {
          hour: parseInt(time[0]),
          minute: parseInt(time[1])
        }

        $.getUserSession('pinnedItem')
        .then(pinnedItem => {
          if (!pinnedItem)
            return $.sendMessage('Вы должны закрепить расписание, которое будет вам отправляться.')

          seneca.act({
            role:'sender',
            cmd:'subscribe',
            type:'schedule',
            chatId: $.chatId,
            sendingTime: time,
            pinnedItem: pinnedItem
          })

          return
        })


        $.setUserSession('sendingTime', time)
        .then(() => {
          $.sendMessage('Время уведомлений сохранено!')
          this.chooseSetting($)
          return
        })
      } else {
        $.sendMessage('Вы ввели не время. Отмена.')
        this.chooseSetting($)
      }
    }

    let menuButtons = {
      '⬅️ Назад': (choose$) => {
        choose$.sendMessage('Отмена.')
        this.chooseSetting(choose$)
      },
      '⬅️ Меню': (choose$) => {
        choose$.sendMessage('Отмена.')
        this.handle(choose$, true)
      },
      '06:30': _enableNotifications,
      '07:00': _enableNotifications,
      '07:30': _enableNotifications,
      '11:00': _enableNotifications,
      '11:30': _enableNotifications,
      '12:00': _enableNotifications
    }

    $.runMenu(fast.assign({
      message: 'Выберите или введите время для уведомлений в формате HH:MM',
      resizeKeyboard: true,
      layout: [2, 3, 3],
      'anyMatch': _enableNotifications
    }, menuButtons))
    .catch(console.log)
  }

  showInformation($) {
    $.sendMessage(this.info, {
      parse_mode: 'Markdown'
    })
    .then(() => this.handle($, true))
    .catch(console.log)
  }

}

class PingController extends TelegramBaseController {

  handle($) {
    $.sendMessage('pong')
    .catch(console.log)
  }

}

class StopController extends TelegramBaseController {

  handle($) {

  }

}

const pingController = new PingController()
const stopController = new StopController()
const scheduleController = new ScheduleController()

tg.router
  .when(new TextCommand('ping'), pingController)
  .when(new TextCommand('stop'), stopController)
  .otherwise(scheduleController)