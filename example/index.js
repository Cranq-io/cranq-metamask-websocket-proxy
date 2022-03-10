const MetaMaskWebsocketProxy = require("@cranq/metamask-websocket-proxy").default;
const Web3 = require("web3");

const port = 3333;

const metaMaskWebsocketProxy = new MetaMaskWebsocketProxy({
  port // this is the default port
});

metaMaskWebsocketProxy.start()
  .then(async () => {
    console.log("MetaMask Websocket Proxy started");
    const authorizationUrl = `http://localhost:${port}`;
    const providerUrl = `ws://localhost:${port}`;
    console.log(`Now open the following URL in your MetaMask enabled browser: ${authorizationUrl}`);
    const web3 = new Web3(providerUrl);
    web3.eth.getAccounts().then(([account]) => {
      console.log(`Active account in Metamask: ${account}`);
      metaMaskWebsocketProxy.stop();
    });
  })
  .catch((error) => {
    console.error(error);
  });