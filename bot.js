'use strict'

const Telegram = require('telegram-node-bot')
const TelegramBaseController = Telegram.TelegramBaseController
const TextCommand = Telegram.TextCommand
const MongooseStorage = require('./MongooseStorage.js')
const fs = require('fs')
const fast = require('fast.js')

const tg = new Telegram.Telegram(require('./token').token, {
        webAdmin: {
            port: 3010,
            host: 'localhost'
        },
        storage: new MongooseStorage()
    })

tg.onMaster(() => {
  const mongoose = require('mongoose')
  mongoose.connect('mongodb://localhost/kbpbot', {})
})

class ScheludeController extends TelegramBaseController {

    static capsFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1)
    }

    static toStringNumber(num) {
        return (num <= 9) ? '0' + num.toString() : num.toString()
    }

    constructor(config) {
        super()

        config = config || {}

        var loadSchelude = () => {
            return new Promise((resolve, reject) => {
                fs.readFile('./timetable.json', 'utf8', (err, data) => {
                    if (err) return reject(err)
                    return resolve(data)
                })
            })
            .then((data) => {
                this.schelude = JSON.parse(data)
                console.log('Timetable reloaded in ' + process.pid)
            })
            .catch((err) => {
                console.log('ERROR in timetable reload:', err.message)
                return
            })
        }

        loadSchelude()

        setInterval(() => {
            loadSchelude()
        }, 14 * 60 * 60 * 1000)

        this.days = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ']
        this.decDays = ['воскресенье', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу']

        this.info = 'Тут пока нет информации'

        fs.readFile(config.infoPath || 'BOT_INFO.MD', 'utf8', (err, data) => {
          if (err) console.log('information not loaded, fs.readFile fail')
          this.info = data
        })
    }

    handle($) {
        new Promise((resolve, reject) => {
            if ($.idFromGroupChat)
                return resolve($.getChatSession('pinnedItem'))
            else
                return resolve($.getUserSession('pinnedItem'))
        })
        .then((pinnedItem) => {
            let menuButtons = {}
            let layout = [2, 2, 3]

            if (pinnedItem 
                && this.schelude[pinnedItem.category]
                && this.schelude[pinnedItem.category][pinnedItem.item]) {
                layout = [1, 2, 2, 3]
                let tempText = '📍 ' +
                                ScheludeController.capsFirst(pinnedItem.category) +
                                ' - ' +
                                ScheludeController.capsFirst(pinnedItem.item)
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
                        this.handle(choose$)
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
            .then(() => this.handle(choose$))
            .catch(console.log)
        }

        fast.forEach(Object.keys(this.schelude[category]), (item, ind) => {
            menuButtons[ScheludeController.capsFirst(item)] = (choose$) => {
                this.chooseDayInItem(choose$, category, item)
            }
        })

        $.runMenu(fast.assign({
            message: 'Выберите то, что вам нужно, или введите с клавиатуры (для ввода самому нужна предельная точность)',
            resizeKeyboard: true,
            layout: 3,
            'anyMatch': (choose$) => {
                choose$.sendMessage('Упс, кнопка не найдена. Отмена.')
                .then(() => this.handle(choose$))
                .catch(console.log)
            }
        }, menuButtons))
        .catch(console.log)
    }

    chooseDayInItem($, category, item) {
        let menuButtons = {}

        menuButtons['⬅️ Назад'] = (choose$) => {
            this.chooseItemInCategory(choose$, category)
        }

        menuButtons['⬅️ Меню'] = (choose$) => {
            this.handle(choose$)
        }

        let currentDay = (new Date()).getDay()

        fast.forEach(Object.keys(this.schelude[category][item]), (day, ind) => {
            day = parseInt(day)
            let caption = (currentDay === day) ? '>' + this.days[day] + '<' : this.days[day]
            menuButtons[caption] = (choose$) => {
                this.showDay(choose$, category, item, day.toString())
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
    }

    showDay($, category, item, day) {

        let lessons = ''

        fast.forEach(Object.keys(this.schelude[category][item][day]), (lessonNo, ind) => {
            let lesson = this.schelude[category][item][day][lessonNo]
            lesson.subject = lesson.subject.trim()
            lesson.group = lesson.group.trim()
            lesson.classroom = lesson.classroom.trim()
            lessons = lessons 
                + '\n\n' 
                + 'Пара №' + lessonNo + (lesson.replacement ? ' (замена)' : '' )
                + ((lesson.subject && (category !== 'предмет')) ? '\n- ' + lesson.subject  : '')
                + ((lesson.group && (category !== 'группа')) ? '\n- ' + lesson.group : '')
                + ((lesson.teachers && lesson.teachers.length && (category !== 'преподаватель')) ? '\n- ' + lesson.teachers.join(', ') : '')
                + (lesson.classroom ? '\n- Аудитория ' + lesson.classroom : '')
        })

        let outDay = ((new Date()).getDay() === parseInt(day)) ? 'сегодня (' + this.days[day] + ')' : this.decDays[day]
        lessons = lessons || 'Пар на ' + outDay + ' нет'

        $.sendMessage(item + ', пары на ' + outDay + ': ' + lessons)
        .then(() => this.chooseDayInItem($, category, item))
        .catch(console.log)
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
                .then(() => this.handle(choose$))
                .catch(console.log)
            }
        }

        fast.forEach(Object.keys(this.schelude[category]), (item, ind) => {
            menuButtons[ScheludeController.capsFirst(item)] = (choose$) => {

            if ($.idFromGroupChat)
                choose$.setChatSession('pinnedItem', {
                    category: category,
                    item: item
                })
                .then(() => {
                    choose$.sendMessage('Расписание для чата закреплено!')
                    .then(() => this.chooseSetting(choose$))
                    .catch(console.log)
                })
            else
                choose$.setUserSession('pinnedItem', {
                    category: category,
                    item: item
                })
                .then(() => {
                    choose$.sendMessage('Расписание закреплено!')
                    .then(() => this.chooseSetting(choose$))
                    .catch(console.log)
                })
            }
        })

        $.runMenu(fast.assign({
            message: 'Выберите элемент, который хотите закрепить',
            resizeKeyboard: true,
            layout: 3,
            'anyMatch': (choose$) => {
                choose$.sendMessage('Упс, кнопка не найдена. Отмена.')
                .then(() => this.handle(choose$))
                .catch(console.log)
            }
        }, menuButtons))
        .catch(console.log)
    }

    unpinItem($) {
        if ($.idFromGroupChat)
            $.setChatSession('pinnedItem', null)
            .then(() => {
                $.sendMessage('Расписание откреплено из чата!')
                .then(() => this.chooseSetting($))
                .catch(console.log)
            })
        else
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
                if ($.idFromGroupChat)
                    resolve($.getChatSession('pinnedItem'))
                else
                    resolve($.getUserSession('pinnedItem'))
            }),
            new Promise((resolve, reject) => {
                if ($.idFromGroupChat)
                    resolve($.getChatSession('sendingTime'))
                else
                    resolve($.getUserSession('sendingTime'))
            })
        ])
        .then(settings => {

            let pinnedItem = settings[0]
            let sendingTime = settings[1]
            let tempText = ''

            let menuButtons = {
                '⬅️ Меню': (choose$) => {
                    this.handle(choose$)
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
                    this.handle(choose$)
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
                && this.schelude[pinnedItem.category]
                && this.schelude[pinnedItem.category][pinnedItem.item]) {

                tempText = '📍 Закреплено: ' +
                            ScheludeController.capsFirst(pinnedItem.category) +
                            ' - ' +
                            ScheludeController.capsFirst(pinnedItem.item)

                menuButtons[tempText] = pinItemMenu
            } else {
                menuButtons['📌 Закрепить элемент'] = pinItemMenu
            }

            if (sendingTime) {
                tempText = '🔔 Уведомления в ' + 
                            ScheludeController.toStringNumber(sendingTime.hour) + 
                            ':' + 
                            ScheludeController.toStringNumber(sendingTime.minute) + 
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
                    .then(() => this.handle(choose$))
                    .catch(console.log)
                }
            }, menuButtons))
            .catch(console.log)
        }, console.log)

    }

    disableNotifications($) {

        if ($.idFromGroupChat)
            $.setChatSession('sendingTime', null)
            .then(() => {
                $.sendMessage('Уведомления для чата отключены!')
                .then(() => this.chooseSetting($))
                .catch(console.log)
            }, console.log)
        else
            $.setUserSession('sendingTime', null)
            .then(() => {
                $.sendMessage('Уведомления отключены!')
                .then(() => this.chooseSetting($))
                .catch(console.log)
            }, console.log)

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
                if ($.idFromGroupChat)
                    $.setChatSession('sendingTime', time)
                    .then(() => {
                        $.sendMessage('Время уведомлений для чата сохранено!')
                        .then(() => this.chooseSetting($))
                        .catch(console.log)
                    }, console.log)
                else
                    $.setUserSession('sendingTime', time)
                    .then(() => {
                        $.sendMessage('Время уведомлений сохранено!')
                        .then(() => this.chooseSetting($))
                        .catch(console.log)
                    }, console.log)
            } else {
                $.sendMessage('Вы ввели не время. Отмена.')
                .then(() => this.chooseSetting($))
                .catch(console.log)
            }
        }

        let menuButtons = {
            '⬅️ Назад': (choose$) => {
                choose$.sendMessage('Отмена.')
                .then(() => this.chooseSetting(choose$))
                .catch(console.log)
            },
            '⬅️ Меню': (choose$) => {
                choose$.sendMessage('Отмена.')
                .then(() => this.handle(choose$))
                .catch(console.log)
            },
            '06:30': _enableNotifications,
            '07:00': _enableNotifications,
            '07:30': _enableNotifications,
            '11:00': _enableNotifications,
            '11:30': _enableNotifications,
            '12:00': _enableNotifications
        }

        $.runMenu(fast.assign({
            message: 'Выберите или введите время для уведомлений в формате HH:MM (хотя они всё равно пока не работают)',
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
        .then(() => this.handle($))
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
const scheludeController = new ScheludeController()

tg.router
    .when(new TextCommand('ping'), pingController)
    .when(new TextCommand('stop'), stopController)
    .otherwise(scheludeController)