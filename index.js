var Service, Characteristic
const packageJson = require('./package.json')
const request = require('request')

module.exports = function (homebridge) {
  Service = homebridge.hap.Service
  Characteristic = homebridge.hap.Characteristic
  homebridge.registerAccessory('homebridge-garage-remote-http', 'GarageDoorOpener', GarageDoorOpener)
}

function GarageDoorOpener (log, config) {
  this.log = log

  this.name = config.name

  this.openURL = config.openURL
  this.closeURL = config.closeURL

  this.openTime = config.openTime || 10
  this.closeTime = config.closeTime || 10

  this.switchOff = config.switchOff || false
  this.switchOffDelay = config.switchOffDelay || 2

  this.autoLock = config.autoLock || false
  this.autoLockDelay = config.autoLockDelay || 20

  this.manufacturer = config.manufacturer || packageJson.author.name
  this.serial = config.serial || packageJson.version
  this.model = config.model || packageJson.name
  this.firmware = config.firmware || packageJson.version

  this.username = config.username || null
  this.password = config.password || null
  this.timeout = config.timeout || 3000
  this.http_method = config.http_method || 'GET'

  this.polling = config.polling || false
  this.pollInterval = config.pollInterval || 120
  this.statusURL = config.statusURL
  this.statusURLBody = config.statusURLBody || ''

  if (this.username != null && this.password != null) {
    this.auth = {
      user: this.username,
      pass: this.password
    }
  }

  this.service = new Service.GarageDoorOpener(this.name)
}

GarageDoorOpener.prototype = {

  identify: function (callback) {
    this.log.debug('Identify requested!')
    callback()
  },

  _httpRequest: function (url, body, method, callback) {
    request({
      url: url,
      body: body,
      method: method,
      timeout: this.timeout,
      rejectUnauthorized: false,
      auth: this.auth
    },
    function (error, response, body) {
      callback(error, response, body)
    })
  },

  _getStatus: function (callback) {
    var url = this.statusURL
    var body = this.statusURLBody
    this.log.debug('Getting status: %s, %s', url, body)

    this._httpRequest(url, body, this.http_method, function (error, response, responseBody) {
      if (error) {
        this.log.warn('Error getting status: %s', error.message)
        this.service.getCharacteristic(Characteristic.CurrentDoorState).updateValue(new Error('Polling failed'))
        callback(error)
      } else {
        this.service.getCharacteristic(Characteristic.CurrentDoorState).updateValue(responseBody)
        this.service.getCharacteristic(Characteristic.TargetDoorState).updateValue(responseBody)
        this.log.debug('Updated state to: %s', responseBody)
        callback()
      }
    }.bind(this))
  },

  setTargetDoorState: function (value, callback) {
    var url
    this.log.debug('Setting targetDoorState to %s', value)
    const currentState = this.service.getCharacteristic(Characteristic.CurrentDoorState.value);
    if (value == currentState){
      this.log.debug("Door was already in that state");
      callback()
      return;
    }
    else if (value === 1 && value != this._getStatus(function () {})) {     
      url = this.closeURL
    } else {
      url = this.openURL
    }
    this._httpRequest(url, '', this.http_method, function (error, response, responseBody) {
      if (error) {
        this.log.warn('Error setting targetDoorState: %s', error.message)
        callback(error)
      } else {
        if (value === 1) {
          this.log.debug('Started closing')
          this.simulateClose()
        } else {
		  this.log.debug('Started opening')
		  if (this.switchOff) {
			this.switchOffFunction()
		  }
          if (this.autoLock) {
            this.autoLockFunction()
          }
          this.simulateOpen()
        }
        callback()
      }
    }.bind(this))
  },

  simulateOpen: function () {
    this.service.getCharacteristic(Characteristic.CurrentDoorState).updateValue(2)
    setTimeout(() => {
      this.service.getCharacteristic(Characteristic.CurrentDoorState).updateValue(0)
      this.log.debug('Finished opening')
    }, this.openTime * 1000)
  },

  simulateClose: function () {
    this.service.getCharacteristic(Characteristic.CurrentDoorState).updateValue(3)
    setTimeout(() => {
      this.service.getCharacteristic(Characteristic.CurrentDoorState).updateValue(1)
      this.log.debug('Finished closing')
    }, this.closeTime * 1000)
  },

  autoLockFunction: function () {
    this.log.debug('Waiting %s seconds for autolock', this.autoLockDelay)
    setTimeout(() => {
      this.service.setCharacteristic(Characteristic.TargetDoorState, 1)
      this.log.debug('Autolocking...')
    }, this.autoLockDelay * 1000)
  },

  switchOffFunction: function () {
	this.log.debug('Waiting %s seconds for switch off', this.switchOffDelay)
    setTimeout(() => {
	  this.log.debug('SwitchOff...')
	  this._httpRequest(this.closeURL, '', this.http_method, function (error, response, responseBody) {
		}.bind(this))
    }, this.switchOffDelay * 1000)
  },

  getServices: function () {
    this.informationService = new Service.AccessoryInformation()
    this.informationService
      .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
      .setCharacteristic(Characteristic.Model, this.model)
      .setCharacteristic(Characteristic.SerialNumber, this.serial)
      .setCharacteristic(Characteristic.FirmwareRevision, this.firmware)

    this.service
      .getCharacteristic(Characteristic.TargetDoorState)
      .on('set', this.setTargetDoorState.bind(this))

    if (this.polling) {
      this._getStatus(function () {})

      setInterval(function () {
        this._getStatus(function () {})
      }.bind(this), this.pollInterval * 1000)
    } else {
      this.service.getCharacteristic(Characteristic.CurrentDoorState).updateValue(1)
      this.service.getCharacteristic(Characteristic.TargetDoorState).updateValue(1)
    }

    return [this.informationService, this.service]
  }
}
