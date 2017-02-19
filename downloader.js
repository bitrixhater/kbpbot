const Cheerio = require('cheerio'),
      Request = require('request'),
      ProgressBar = require('progress'),
      Fs = require('fs'),
      Util = require('util')

// const mongoose = require('mongoose')
// const Schema = mongoose.Schema
// const Schelude = mongoose.model('Schelude', new Schema({
//   name: String,
//   type: String,
//   url: String,
//   updated: String,
//   schelude: Types.Mixed,
// }))

// mongoose.connect('mongodb://localhost/kbpbot', {})

let output = 'timetable.json',
    callback = () => {
      console.log('----------------')
      console.log('Schelude updated at ' + (new Date()).toString() + ' into the \'' + output + '\'')
      console.log('----------------')
      console.log('waiting...')
    }

class KbpParser {

  // exportToMongo() {
  //   return this._parseFullSchelude()
  //   .then((types) => {
  //     let pool = new Promise(resolve => (1))
  //     Object.keys(types).forEach(t => {
  //       let type = t
  //       Object.keys(types[type]).forEach(s => {
  //         let schelude = s
  //         pool = pool
  //         .then(() => new Promise((resolve, reject) => {
  //           Schelude.findOne({ 'name': schelude, 'type': type }, 'name type', function (err, finded) {
  //             if (err) {
  //               reject(err)
  //               return
  //             }
  //             finded.updated = Date.now()
  //             finded.schelude = schelude
  //             resolve(finded.save())
  //           })
  //         }))
  //       })
  //     })
  //     return pool
  //   })
  // }

  _parseFullSchelude() {
    return this._parseStuff('http://kbp.by/rasp/timetable/view_beta_tbp/?q=')
      .then((result) => {
        let list = result
        let pool = new Promise(resolve => resolve(1)),
            cnt = 0
        
        for (let type_key in list) {
          for (let sch_key in list[type_key]) {
            cnt++
            let url = 'http://kbp.by/rasp/timetable/view_beta_tbp/'+list[type_key][sch_key]
            pool = pool.then(() => this._parseWeek(url))
            .then(result => {
              bar.tick()
              list[type_key][sch_key] = //{
                //url: url,
                //updated: Date.now(),
                /* schelude: */result
              //}
            })
            .catch(error => console.log('pool error: '+url)/*throw new Error(error)*/)
            //break
          }
        }
        
        pool = pool.then(() => {
          for (let type_key in list)
            for(let sch_key in list[type_key])  
              if (Object.getOwnPropertyNames(list[type_key][sch_key]).length == 0) delete list[type_key][sch_key]
          return list
        })
        
        let bar = new ProgressBar('downloading [:bar] :percent :etas', { total: cnt, width: 50})
        
        return pool
      })
  }
  
  exportTimetable(file, callback) { // refactor
    console.log('idk why its still alive, rly')
    return this._parseFullSchelude()
    .then(list => {
      console.log(list)
      if (file) 
        this._saveJSON(file, list)
        .then(() => list)
      return list
    })
    .then(() =>{ 
      if (callback) return callback.call(this)
      return
    })
    .catch(error => console.log('wtf error: ' + error)/*throw new Error(error)*/)
  }
  
  _request(url, bodyHandler) {
    return new Promise((resolve, reject) => {
      Request(url, (error, response, body) => {
        if (!error && response.statusCode == 200) {
          resolve(bodyHandler(Cheerio.load(body)))
        } else {
          reject(new Error(error))
        }
      })
    })
  }
  
  _saveJSON(file, obj) {
    return new Promise((resolve, reject) => {
      Fs.unlink(file, () => {
        Fs.writeFile(file, JSON.stringify(obj, null, 2) , 'utf8', (error) => {
          if (!error) {
            resolve()
          } else {
            reject(new Error(error))
          }
        })
      })
    })
  }
  
  _parseStuff(url) {
    return this._request(url, $ => {
      var stuff = {}
      $('.block_back div:not(.text_h1)').each((ind, elem) => {
        var i = $(elem).find('span').text().trim(),
            e = $(elem).find('a')
          stuff[i] = stuff[i] || {}
          stuff[i][e.text().trim()] = e.attr('href').trim()
      })
      //console.log(stuff)
      return stuff
    })
  }
  
  _parseWeek(url) {
    return this._request(url, $ => {
      var lessons = {}
      // т.к. расписание - таблица проходим по строкам с парами,
      $('#left_week tr:nth-child(n+3)').each((lesson_ind, lesson_days) => {
        lesson_ind++
        // а потом с днями недели для каждой пары
        $(lesson_days).find('td:not(.number)').each((day_ind, lesson) => {
          day_ind++
          lesson = $(lesson).find('.pair:not(.removed)')
          var subject = lesson.find('.subject').text().trim()
          if (subject) {
            // если lesson_ind'пара есть в day_ind'день, тогда добавляем её в массив
            lessons[day_ind] = lessons[day_ind] || {}
            var teachers = []
            lesson.find('.teacher').each((teacher_ind, teacher) => {
              teacher = $(teacher).text().trim()
              if (teacher) teachers.push(teacher)
            })
            lessons[day_ind][lesson_ind] = {
              subject:   subject,
              teachers:  teachers,
              group:     lesson.find('.group').text().trim(),
              classroom: lesson.find('.place').text().trim(),
              extra:     lesson.find('.extra').text().trim(),
              replacement: lesson.hasClass('added')
            }
          }
        })
      })
      return lessons
    })
  }
}

var kbp = new KbpParser()
var fileStats = {}

try {
  fileStats = Fs.statSync(output)

  if(fileStats.mtime) {
    var tm = new Date(Util.inspect(fileStats.mtime))
    console.log('----------------')
    console.log('current ts      is ', Date.now())
    console.log('file modify + 6 is ', tm.setHours(tm.getHours() + 6))

    if (tm.setHours(tm.getHours() + 6) < Date.now()) {
      console.log('less modify < date, downloading')
      kbp.exportTimetable(output, callback)
    }
    console.log('----------------')
  }

} catch(ex) {
  console.log(ex)
  kbp.exportTimetable(output, callback)
}

console.log('waiting...')

//setInterval(kbp.exportTimetable, 12 * 60 * 60 * 1000, output, callback)