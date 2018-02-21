#!/usr/bin/env node

const minimist = require('minimist')
const Model = require('./model')
const {initUI, render} = require('./ui')

const argv = minimist(process.argv.slice(2))
if (argv.help || argv._.length > 1) {
  console.log('Usage: hm-chat --nick=<nick> [<channel-key>]\n')
  process.exit(0)
}

const nick = argv.nick
const channelHex = argv._[0]

const model = new Model({channelHex, nick})
model.once('ready', (model) => {
  initUI(model, (line) => model.addMessageToDoc(line))
})
model.on('updated', model => render(model))
