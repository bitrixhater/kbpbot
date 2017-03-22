const fs = require('fs')
const cron = require('node-cron')

module.exports = function (options) {
  let schedulePath = options.schedulePath || './timetable.json'

  let days = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ']
  let decDays = ['воскресенье', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу']

  let loadSchedule = () => {
    return new Promise((resolve, reject) => {
      fs.readFile(schedulePath, 'utf8', (err, data) => {
        if (err) return reject(err)
        return resolve(data)
      })
    })
    .then((data) => {
      console.log('Timetable reloaded in ' + process.pid)
      return new Promise(resolve => resolve(JSON.parse(data)))
    })
    .catch((err) => {
      console.log('ERROR in timetable reload:', err.message)
      return
    })
  }

  let schedule = loadSchedule()

  cron.schedule('30 11 * * *', () => {
    schedule = loadSchedule()
  })

  this.add('role:schedule,cmd:getCategories', function getCategories(msg, respond) {
    return schedule.then(schedule => {
      respond(null, Object.keys(schedule))
    }, err => {
      respond(err)
    })
  })

  this.add('role:schedule,cmd:getCategoryItems', function getCategoryItems(msg, respond) {
    return schedule.then(schedule => {
      if (schedule[msg.category])
        return respond(null, Object.keys(schedule[msg.category]))
      respond(new Error('Такая категория не найдена'))
    }, err => {
      respond(err)
    })
    .catch(respond)
  })

  this.add('role:schedule,cmd:getItemDays', function getItemDays(msg, respond) {
    return schedule.then(schedule => {
      if (schedule[msg.category]
      && schedule[msg.category][msg.item])
        return respond(null, Object.keys(schedule[msg.category][msg.item]))

      respond(new Error('Такая категория или элемент категории не найден'))
    }, err => {
      respond(err)
    })
    .catch(respond)
  })

  /**
   * Get schelude by category, item of the category and the day
   * @param  int category
   * @param  int item
   * @param  int day
   * @return <Object>.Schelude
   */
  this.add('role:schedule,cmd:getDaySchedule', function getDaySchedule(msg, respond) {
    return schedule.then(schedule => {
      if (schedule[msg.category]
      && schedule[msg.category][msg.item]) {
        if (msg.type === 'json')
          return respond(null, {
            schedule: schedule[msg.category][msg.item][msg.day]
          })

        this.act({ 
          role: "schedule",
          cmd:"formatSchedule",
          item: msg.item,
          category: msg.category,
          day: msg.day,
          schedule: schedule[msg.category][msg.item][msg.day] || []
        }, respond)

        return 
      }
      respond(new Error('Такая категория или элемент категории не найден'))
    }, err => {
      respond(err)
    })
    .catch(respond)
  })

  this.add('role:schedule,cmd:formatSchedule', function formatSchedule(msg, respond) {
    let lessons = ''

    Object.keys(msg.schedule).forEach((lessonNo, ind) => {
      let lesson = msg.schedule[lessonNo]
      lesson.subject = lesson.subject.trim()
      lesson.group = lesson.group.trim()
      lesson.classroom = lesson.classroom.trim()
      lessons = lessons 
        + '\n\n' 
        + 'Пара №' + lessonNo + (lesson.replacement ? ' (замена)' : '' )
        + ((lesson.subject && (msg.category !== 'предмет')) ? '\n- ' + lesson.subject  : '')
        + ((lesson.group && (msg.category !== 'группа')) ? '\n- ' + lesson.group : '')
        + ((lesson.teachers && lesson.teachers.length && (msg.category !== 'преподаватель')) ? '\n- ' + lesson.teachers.join(', ') : '')
        + (lesson.classroom ? '\n- Аудитория ' + lesson.classroom : '')
    })

    let outDay = ((new Date()).getDay() === parseInt(msg.day)) ? 'сегодня (' + days[msg.day] + ')' : decDays[msg.day]
    lessons = lessons || 'Пар на ' + outDay + ' нет'

    respond(null, {
      schedule: msg.item + ', пары на ' + outDay + ': ' + lessons
    })
  })
}