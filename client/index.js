/* global document:true */
/* global WebSocket:true */
/* global window:true */

(async w => {
  const addLog = msg => {
    const logEntry = document.createElement('li');
    logEntry.innerText = `${new Date().toString()}\n${msg}`;
    document.querySelector('#messages').appendChild(logEntry);
  };

  const checkUnlocked = async () => {
    if (w.ethereum) {
      await w.ethereum.enable(); // Ensure access to MetaMask
    }
    const accounts = await w.ethereum.request({ method: 'eth_accounts' });
    return accounts && !!accounts[0];
  };

  const execute = (requestId, method, params) =>
    w.ethereum
      .request({
        method,
        params: params.slice(0, 2),
      })
      .then(result => {
        addLog(
          `Request ID: ${requestId}
          Result from ${method}: ${JSON.stringify(result)}`,
        );
        return result;
      });

  async function executeAction(requestId, { method, params }, reply) {
    let result;
    addLog(
      `Request ID: ${requestId}
      Calling ${method}: ${JSON.stringify(params)}`,
    );
    try {
      result = await execute(requestId, method, params);
    } catch (e) {
      return reply('executed', requestId, {
        error: e.message,
      });
    }
    return reply('executed', requestId, result);
  }

  if (!w.ethereum) {
    return addLog('MetaMask not found!');
  }
  if (!(await checkUnlocked())) {
    return addLog('Please unlock MetaMask first and then reload this page');
  }
  const socket = new WebSocket(`ws://localhost:${window.location.port}`);
  const reply = (action, requestId, payload) =>
    socket.send(JSON.stringify({ action, requestId, payload }));
  socket.onmessage = msg => {
    let message;
    try {
      message = JSON.parse(msg.data);
    } catch (e) {
      return addLog(
        'Could not parse websocket message. Is it a proper JSON command?',
      );
    }
    if (message.action === 'execute') {
      return executeAction(message.requestId, message.payload, reply);
    }
    return true;
  };
  socket.addEventListener('open', () => {
    socket.send('MetaMask client connected');
  });

  return true;
})(window);
