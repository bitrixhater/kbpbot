const cron = require('node-cron')

module.exports = function math(options) {
  let model = options.model
  let sendMessageOptions = options.sendMessageOptions || {}

  let scheduleSenders = {}

  let cursor = model.find({
    // $and: [
    //   {
    //     keys: {
    //       "pinneditem": {
    //         $ne: null
    //       }
    //     },
    //   },
    //   {
    //     keys: {
    //       "sendingtime": {
    //         $ne: null
    //       }
    //     }
    //   }
    // ]
  }).cursor()

  cursor.on('data', (doc) => {
    let sendingTime
    let pinnedItem

    for (key in doc.keys) {
      if (doc.keys[key].name == 'sendingtime')
        sendingTime = doc.keys[key].value

      if (doc.keys[key].name == 'pinneditem')
        pinnedItem = doc.keys[key].value
    }

    if (!sendingTime || !pinnedItem) return

    this.act({
      role: 'sender',
      cmd: 'subscribe', 
      type: 'schedule',
      chatId: doc.chatId,
      sendingTime: sendingTime,
      pinnedItem: pinnedItem
    })
  })

  this.add('role:sender,cmd:subscribe,type:schedule', function subscribeForSchedule(msg, respond) {
    console.info(
      '------------\nSUBSCRIBE FROM ' + 
      msg.chatId + 
      ' ON ' + 
      JSON.stringify(msg.sendingTime) + 
      ' OF ' + 
      JSON.stringify(msg.pinnedItem) + 
      '\n------------'
    )

    if (!scheduleSenders[msg.chatId]) {
      scheduleSenders[msg.chatId] = cron.schedule(
        msg.sendingTime.minute + ' ' + msg.sendingTime.hour + ' * * *', 
        () => {
          this.act({
            role: 'sender',
            cmd: 'send',
            type: 'schedule',
            chatId: msg.chatId,
            category: msg.pinnedItem.category,
            item: msg.pinnedItem.item
          })
        }
      )
    }

    respond(null, {ok: true})
  })

  this.add('role:sender,cmd:unscribe,type:schedule', function unscribeFromSchedule(msg, respond) {
    console.info(
      '------------\nUNSCRIBE FROM ' + msg.chatId + '\n------------'
    )

    if (scheduleSenders[msg.chatId]) {
      scheduleSenders[msg.chatId].stop()
      scheduleSenders[msg.chatId] = null
    }

    respond(null, {ok: true})
  })

  this.add('role:sender,cmd:send', function send(msg, respond) {
    sendMessage(msg.chatId, msg.message, sendMessageOptions)
    .then(response => {
      respond(null, {
        response: response
      })
    })
    .catch(err => {
      console.error(err)
      respond(err)
    })
  })

  this.add('role:sender,cmd:send,type:schedule', function sendSchedule(msg, respond) {
    this.act({
      role: 'schedule',
      cmd: 'getDaySchedule',
      category: msg.category,
      item: msg.item,
      day: (new Date( )).getDay().toString(),
    }, (err, day) => {
      if (err) 
        return respond(err)

      this.act({
        role: 'tg',
        cmd: 'api',
        method: 'sendMessage',
        args: [
          msg.chatId,
          day.schedule,
          sendMessageOptions
        ]
      }, respond)
    })
  })

}
