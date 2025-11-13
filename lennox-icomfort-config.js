// Config node for storing Lennox iComfort credentials
module.exports = function(RED) {
    function LennoxIcomfortConfigNode(config) {
        RED.nodes.createNode(this, config);
        this.name = config.name;
        this.username = config.username;
        this.password = config.password;
        this.deviceId = config.deviceId || '';
    }
    RED.nodes.registerType('lennox-icomfort-config', LennoxIcomfortConfigNode);
};
