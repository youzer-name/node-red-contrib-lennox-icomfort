// Lennox iComfort Command Node-RED node (for sending commands, no config selector)
module.exports = function(RED) {
    function LennoxIcomfortCommandNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        node.name = config.name;
        node.command = config.command || 'systemInfo';
        node.heatingSetpoint = config.heatingSetpoint;
        node.coolingSetpoint = config.coolingSetpoint;
        node.mode = config.mode;
        node.fanmode = config.fanmode;
        node.thermostatmode = config.thermostatmode;
        node.polling = Number(config.polling) || 0;
        node.on('input', function(msg, send, done) {
            // Only include relevant parameters for the selected command
            const outMsg = { command: node.command };
            switch (node.command) {
                case 'setSetpoints':
                    if (node.heatingSetpoint !== undefined && node.heatingSetpoint !== "") outMsg.heatingSetpoint = node.heatingSetpoint;
                    if (node.coolingSetpoint !== undefined && node.coolingSetpoint !== "") outMsg.coolingSetpoint = node.coolingSetpoint;
                    break;
                case 'setThermostatMode':
                    if (node.mode !== undefined && node.mode !== "") outMsg.mode = node.mode;
                    if (node.thermostatmode !== undefined && node.thermostatmode !== "") outMsg.thermostatmode = node.thermostatmode;
                    break;
                case 'setFanMode':
                    if (node.fanmode !== undefined && node.fanmode !== "") outMsg.fanmode = node.fanmode;
                    break;
                case 'heatLevelUp':
                case 'heatLevelDown':
                case 'coolLevelUp':
                case 'coolLevelDown':
                    // No extra params needed
                    break;
                case 'away':
                case 'present':
                    // No extra params needed
                    break;
                case 'systemInfo':
                case 'getSystemInfo':
                    // No extra params needed
                    break;
                case 'refresh':
                    if (node.polling) outMsg.polling = node.polling;
                    break;
                default:
                    // For any other command, include all non-empty fields
                    if (node.heatingSetpoint !== undefined && node.heatingSetpoint !== "") outMsg.heatingSetpoint = node.heatingSetpoint;
                    if (node.coolingSetpoint !== undefined && node.coolingSetpoint !== "") outMsg.coolingSetpoint = node.coolingSetpoint;
                    if (node.mode !== undefined && node.mode !== "") outMsg.mode = node.mode;
                    if (node.fanmode !== undefined && node.fanmode !== "") outMsg.fanmode = node.fanmode;
                    if (node.thermostatmode !== undefined && node.thermostatmode !== "") outMsg.thermostatmode = node.thermostatmode;
                    if (node.polling) outMsg.polling = node.polling;
            }
            send(outMsg);
            if (done) done();
        });
    }
    RED.nodes.registerType('lennox-icomfort-command', LennoxIcomfortCommandNode);
};
