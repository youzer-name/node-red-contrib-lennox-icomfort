# node-red-contrib-lennox-icomfort

A Node-RED node for controlling Lennox iComfort thermostats

## Features
- Control and monitor Lennox iComfort thermostats
  - Compatible only with older Thermostats that use the https://services.myicomfort.com API.
- Config node for secure credential storage
- Polling support (interval or manual refresh)

## Installation
```
npm install node-red-contrib-lennox-icomfort
```


## Usage

1. Add a `Lennox iComfort Thermostat` node to your flow (one per thermostat).
2. Configure credentials in the config node.
3. Set the polling interval.
4. Optionally enable 'Create global variable':
   - This will update a global variable named `Lennox_{GatewaySN}_status` with the current device status on each refresh.
   - The global variable is useful for dashboards and control flows.
5. Use one or more `Lennox iComfort Command` nodes to send commands to the thermostat:
   - Select a command. Only relevant fields will be shown.
6. Command may also be set directly in the incoming message. See the built-in help text in the Thermostat node for additional info.
   - The command node ignores incoming message parameters and always sends its configured command.
   
- Supported commands: refresh, systemInfo, setSetpoints, setThermostatMode, setFanMode, away, home, heatLevelUp, heatLevelDown, coolLevelUp, coolLevelDown.
   - Level up/down commands adjust the setpoint by 1º and do not require setpoint input.
   - For `setSetpoints`, both heating and cooling setpoints are required.


## Notes

- Only Fahrenheit units are currently supported.
- If required parameters are missing, the node will throw an error.

## Development

- PRs and issues welcome!

## License

MIT

