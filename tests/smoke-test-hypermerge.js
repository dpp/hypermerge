/* global it, describe, before */

const assert = require('assert')
const Automerge = require('automerge')
const ram = require('random-access-memory')
const pump = require('pump')
const through2 = require('through2')
const hypermerge = require('..')

function newHypermerge (storage, key) {
  const promise = new Promise((resolve, reject) => {
    const hm = hypermerge(storage, key)
    hm.on('ready', () => {
      resolve(hm)
    })
    hm.on('error', err => reject(err))
  })
  return promise
}

function connectPeer (hm, key) {
  const promise = new Promise((resolve, reject) => {
    hm.connectPeer(key, (err, peer) => {
      if (err) return reject(err)
      resolve(peer)
    })
  })
  return promise
}

let aliceDoc, bobDoc
let aliceFeed, aliceFeedRemote
let bobFeed, bobFeedRemote
let online = true

describe('smoke test, hypermerge', () => {
  // https://github.com/inkandswitch/hypermerge/wiki/Smoke-Test

  before(async () => {
    // const alice = await newHypermerge('./alice')
    const alice = await newHypermerge(ram)
    aliceFeed = alice.source
    aliceDoc = alice.doc

    const bob = await newHypermerge(ram, alice.key.toString('hex'))
    bobFeed = bob.local
    aliceFeedRemote = bob.source
    bobDoc = bob.doc
    bobFeedRemote = await connectPeer(alice, bobFeed.key)
  })

  function goOffline () {
    // console.log('Go offline')
    online = false
  }

  function goOnline () {
    // console.log('Go online')

    // alice
    const aliceLocal = aliceFeed.replicate({live: true, encrypt: false})
    const aliceRemote = aliceFeedRemote.replicate({live: true, encrypt: false})
    pump(
      aliceLocal,
      through2(function (chunk, enc, cb) {
        // console.log('alice l --> r', chunk)
        if (online) {
          this.push(chunk)
          cb()
        } else {
          cb(new Error('Offline'))
        }
      }),
      aliceRemote,
      through2(function (chunk, enc, cb) {
        // console.log('alice l <-- r', chunk)
        if (online) {
          this.push(chunk)
          cb()
        } else {
          cb(new Error('Offline'))
        }
      }),
      aliceLocal,
      err => {
        if (err && err.message !== 'Offline') {
          console.error('Alice replicate error', err)
        }
      }
    )

    // bob
    const bobLocal = bobFeed.replicate({live: true, encrypt: false})
    const bobRemote = bobFeedRemote.replicate({live: true, encrypt: false})
    pump(
      bobLocal,
      through2(function (chunk, enc, cb) {
        // console.log('bob l --> r', chunk)
        if (online) {
          this.push(chunk)
          cb()
        } else {
          cb(new Error('Offline'))
        }
      }),
      bobRemote,
      through2(function (chunk, enc, cb) {
        // console.log('bob l <-- r', chunk)
        if (online) {
          this.push(chunk)
          cb()
        } else {
          cb(new Error('Offline'))
        }
      }),
      bobLocal,
      err => {
        if (err && err.message !== 'Offline') {
          console.error('Bob replicate error', err)
        }
      }
    )

    online = true
  }

  it(`1. Alice starts with a blank canvas and is online. Bob is also ` +
      `online, has joined, but hasn't synced yet`, () => {
    goOnline()

    aliceDoc.set(Automerge.change(aliceDoc.get(), 'blank canvas', doc => {
      doc.x0y0 = 'w'
      doc.x0y1 = 'w'
      doc.x1y0 = 'w'
      doc.x1y1 = 'w'
    }))
    assert.deepEqual(aliceDoc.get(), {
      _objectId: '00000000-0000-0000-0000-000000000000',
      x0y0: 'w',
      x0y1: 'w',
      x1y0: 'w',
      x1y1: 'w'
    })
  })

  it('2. Alice makes an edit', () => {
    aliceDoc.set(Automerge.change(
      aliceDoc.get(), 'alice adds red pixel',
      doc => { doc.x0y0 = 'r' }
    ))
    assert.deepEqual(aliceDoc.get(), {
      _objectId: '00000000-0000-0000-0000-000000000000',
      x0y0: 'r',
      x0y1: 'w',
      x1y0: 'w',
      x1y1: 'w'
    })
  })

  it(`2a. Alice's edit gets synced over to Bob's canvas`, () => {
    assert.deepEqual(bobDoc.get(), {
      _objectId: '00000000-0000-0000-0000-000000000000',
      x0y0: 'r',
      x0y1: 'w',
      x1y0: 'w',
      x1y1: 'w'
    })
    assert.deepEqual(bobDoc.get()._conflicts, {})
  })

  it('3. Bob makes an edit', () => {
    bobDoc.set(Automerge.change(
      bobDoc.get(), 'bob adds blue pixel',
      doc => { doc.x1y1 = 'b' }
    ))
    assert.deepEqual(bobDoc.get(), {
      _objectId: '00000000-0000-0000-0000-000000000000',
      x0y0: 'r',
      x0y1: 'w',
      x1y0: 'w',
      x1y1: 'b'
    })
  })

  it(`3a. Bob's edit gets synced to Alice's canvas`, () => {
    setTimeout(() => {
      assert.deepEqual(aliceDoc.get(), {
        _objectId: '00000000-0000-0000-0000-000000000000',
        x0y0: 'r',
        x0y1: 'w',
        x1y0: 'w',
        x1y1: 'b'
      })
      assert.deepEqual(aliceDoc.get()._conflicts, {})
    }, 0)
  })

  it('4. Alice and/or Bob go offline', () => {
    goOffline()
  })

  it('5. Both Alice and Bob make edits while offline', () => {
    aliceDoc.set(Automerge.change(
      aliceDoc.get(), 'alice adds green and red pixels',
      doc => {
        doc.x1y0 = 'g'
        doc.x1y1 = 'r'
      }
    ))
    bobDoc.set(Automerge.change(
      bobDoc.get(), 'bob adds green and white pixels',
      doc => {
        doc.x1y0 = 'g'
        doc.x1y1 = 'w'
      }
    ))
    assert.deepEqual(aliceDoc.get(), {
      _objectId: '00000000-0000-0000-0000-000000000000',
      x0y0: 'r',
      x0y1: 'w',
      x1y0: 'g',
      x1y1: 'r'
    })
    assert.deepEqual(bobDoc.get(), {
      _objectId: '00000000-0000-0000-0000-000000000000',
      x0y0: 'r',
      x0y1: 'w',
      x1y0: 'g',
      x1y1: 'w'
    })
  })

  it('6. Alice and Bob both go back online, and re-sync', done => {
    goOnline()

    // wait for sync to happen
    // console.log('sleep')
    setTimeout(() => {
      // console.log('wake')
      const aliceKey = aliceFeed.key.toString('hex')
      const bobKey = bobFeed.key.toString('hex')
      if (aliceKey < bobKey) {
        // console.log('Bob wins')
        assert.deepEqual(aliceDoc.get(), {
          _objectId: '00000000-0000-0000-0000-000000000000',
          x0y0: 'r',
          x0y1: 'w',
          x1y0: 'g',
          x1y1: 'w'
        })
        assert.deepEqual(aliceDoc.get()._conflicts, {
          x1y0: {
            [aliceKey]: 'g'
          },
          x1y1: {
            [aliceKey]: 'r'
          }
        })
        assert.deepEqual(bobDoc.get(), {
          _objectId: '00000000-0000-0000-0000-000000000000',
          x0y0: 'r',
          x0y1: 'w',
          x1y0: 'g',
          x1y1: 'w'
        })
        assert.deepEqual(bobDoc.get()._conflicts, {
          x1y0: {
            [aliceKey]: 'g'
          },
          x1y1: {
            [aliceKey]: 'r'
          }
        })
      } else {
        // console.log('Alice wins')
        assert.deepEqual(aliceDoc.get(), {
          _objectId: '00000000-0000-0000-0000-000000000000',
          x0y0: 'r',
          x0y1: 'w',
          x1y0: 'g',
          x1y1: 'r'
        })
        assert.deepEqual(aliceDoc.get()._conflicts, {
          x1y0: {
            [bobKey]: 'g'
          },
          x1y1: {
            [bobKey]: 'w'
          }
        })
        assert.deepEqual(bobDoc.get(), {
          _objectId: '00000000-0000-0000-0000-000000000000',
          x0y0: 'r',
          x0y1: 'w',
          x1y0: 'g',
          x1y1: 'r'
        })
        assert.deepEqual(bobDoc.get()._conflicts, {
          x1y0: {
            [bobKey]: 'g'
          },
          x1y1: {
            [bobKey]: 'w'
          }
        })
      }
      done()
    }, 0)
  })
})
