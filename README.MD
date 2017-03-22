# Инструкция
Во-первых, нужно переименовать token.example.json в token.json и вставить туда свой токен
А потом просто бахнуть вот это вот:
```
  npm i && cd node_modules/telegram-node-bot && npm i && cd ../..
  node downloader
  // подождать пока скачается и бахнуть ctrl+c
  screen -dmS kbpbot node bot -L
  screen -dmS kbpbot-downloader node downloader -L
```
(демон для лохов, скрин - выбор мастеров)
Чтобы обновить расписание
```
  node downloader
```
...и подождать какое-то время (максимум 14 часов), или перезапустить бота

# Ысыолвсицж
По вопросам пишите сюда в чатик @kbpchat или напрямую мне - @bitrixhater.

*Уведомления пока не работают*