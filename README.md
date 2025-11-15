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

**Deadband enforcement:**
- For `setSetpoints`, the cooling setpoint must be at least 3°F higher than the heating setpoint. The editor will prevent saving if this is not met.
- For level up/down commands, the thermostat node will automatically adjust the other setpoint if needed to maintain the 3°F deadband.
- In High Dehumidification mode, the deadband is 5°F.  This is not currently handled by this node.  Setpoint or level up/down command may silently fail if they don't meet this deadband requirement and the thermostat is in this mode.  See https://www.lennox.com/literature/Lennox_icomfortWiFi_Installation_Manual.pdf (page 17).

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

