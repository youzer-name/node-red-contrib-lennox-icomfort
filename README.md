# node-red-contrib-lennox-icomfort

A Node-RED node for controlling Lennox iComfort thermostats, supporting all Hubitat driver commands and Dashboard 2 UI widgets.

## Features
- Control and monitor Lennox iComfort thermostats
- All Hubitat driver commands available
- Config node for secure credential storage
- Polling support (interval or manual refresh)
- Dashboard 2 UI widgets for status and control

## Installation

Place this folder in your Node-RED user directory under `node_modules` or install via npm (when published):

```
npm install node-red-contrib-lennox-icomfort
```

## Usage

1. Add the `Lennox iComfort` node to your flow.
2. Configure credentials in the config node.
3. Select the desired command and polling interval.
4. Enable Dashboard 2 UI if desired.
5. Deploy and use the node in your flows.

## Development

- PRs and issues welcome!
- See the Hubitat driver for command reference.

## License

Apache-2.0
