const express = require('express');
const cors = require('cors');
const axios = require('axios');
const WebSocket = require('ws');

// ==================== 极致性能配置 ====================
const CONFIG = {
  // 钉钉配置
  DINGTALK_WEBHOOK: 'https://oapi.dingtalk.com/robot/send?access_token=d5d287f2356ab6bfa343bd2300fee541d0066505f938871992872ffc7db7a2c8',
  
  // 监控的钱包地址
  MONITORED_WALLETS: [
    '0x242baea6afbacde994817805db8b5c020a665811',
    '0xd1963eaa57432147b658de28c762cae79f2c8308'
  ].map(addr => addr.toLowerCase()),
  
  // 极速节点配置
  NODES: {
    websocket: [
      {
        url: 'wss://bsc-ws-node.nariox.org:443',
        name: 'Binance Official',
        supportsPending: true
      },
      {
        url: 'wss://bsc-mainnet.nodereal.io/ws',
        name: 'NodeReal WS', 
        supportsPending: true
      }
    ],
    http: [
      {
        url: 'https://bsc-dataseed.binance.org',
        name: 'Binance Primary'
      },
      {
        url: 'https://bsc-dataseed1.defibit.io',
        name: 'Defibit'
      },
      {
        url: 'https://bsc-mainnet.nodereal.io',
        name: 'NodeReal HTTP'
      }
    ]
  },
  
  // 极致性能配置
  SPEED_OPTIMIZATION: {
    targetNotificationTime: 2000,     // 目标：2秒内！
    blockProcessDelay: 300,           // 区块延迟：0.3秒
    pendingTxDelay: 50,               // 交易池处理延迟：0.05秒
    maxRetries: 1,                    // 减少重试
    cacheSize: {
      transactions: 3000,
      blocks: 150
    }
  }
};

// ==================== 极速消息模板 ====================
class TurboMessageTemplates {
  static ultraFast(walletAddress, amount, txHash, type, isToken = false, contractAddress = '') {
    let text = `### ⚡ 实时交易警报\n\n**${type}** | 🚨 交易池检测\n\n` +
               `**状态**: ⏳ 等待确认\n` +
               `**钱包**: \`${walletAddress}\`\n` +
               `**金额**: ${amount} BNB\n`;
    
    if (isToken) {
      text += `**类型**: 代币交易\n`;
    }
    
    text += `**交易哈希**: \`${txHash}\`\n\n` +
            `🔍 秒级检测完成，等待区块链确认...\n\n` +
            `👇 **复制地址（长按下方代码块）** 👇\n\n` +
            `👛 钱包地址：\n\`\`\`\n${walletAddress}\n\`\`\`\n`;
    
    if (isToken && contractAddress) {
      text += `📄 合约地址：\n\`\`\`\n${contractAddress}\n\`\`\`\n`;
    }
    
    return text;
  }
  
  static confirmed(walletAddress, amount, txHash, blockNumber, type, tokenInfo = null) {
    let text = `### ✅ 交易已确认\n\n**${type}** | 区块确认完成\n\n` +
               `**状态**: ✅ 确认成功\n` +
               `**钱包**: \`${walletAddress}\`\n` +
               `**金额**: ${amount} BNB\n` +
               `**区块**: ${blockNumber}\n` +
               `**交易哈希**: \`${txHash}\`\n\n`;
    
    if (tokenInfo) {
      text += `**代币**: ${tokenInfo.name} (${tokenInfo.symbol})\n`;
    }
    
    text += `👇 **复制地址（长按下方代码块）** 👇\n\n` +
            `👛 钱包地址：\n\`\`\`\n${walletAddress}\n\`\`\`\n`;
    
    if (tokenInfo) {
      text += `📄 合约地址：\n\`\`\`\n${tokenInfo.address}\n\`\`\`\n`;
    }
    
    text += `🔗 **快速链接**\n` +
            `• [查看交易](https://bscscan.com/tx/${txHash})\n` +
            `• [查看钱包](https://bscscan.com/address/${walletAddress})\n`;
    
    if (tokenInfo) {
      text += `• [查看合约](https://bscscan.com/address/${tokenInfo.address})`;
    }
    
    return text;
  }
}

// ==================== 钉钉连接池 ====================
class DingTalkPool {
  constructor() {
    this.queue = [];
    this.sending = false;
    this.concurrency = 3; // 并发发送数量
    this.successCount = 0;
    this.failCount = 0;
  }
  
  async send(message) {
    return new Promise((resolve) => {
      this.queue.push({ message, resolve });
      this.processQueue();
    });
  }
  
  async processQueue() {
    if (this.sending || this.queue.length === 0) return;
    
    this.sending = true;
    const batch = this.queue.splice(0, this.concurrency);
    
    const results = await Promise.allSettled(
      batch.map(({ message, resolve }) => 
        axios.post(CONFIG.DINGTALK_WEBHOOK, message, { 
          timeout: 2000, // 超时时间缩短到2秒
          headers: { 'Content-Type': 'application/json' }
        })
          .then(response => {
            this.successCount++;
            resolve(true);
            return true;
          })
          .catch(error => {
            this.failCount++;
            console.log('❌ 钉钉发送失败:', error.message);
            resolve(false);
            return false;
          })
      )
    );
    
    this.sending = false;
    
    // 立即处理下一批
    setImmediate(() => this.processQueue());
  }
  
  getStats() {
    return {
      queueLength: this.queue.length,
      successCount: this.successCount,
      failCount: this.failCount,
      sending: this.sending
    };
  }
}

// ==================== 节点优化器 ====================
class NodeOptimizer {
  constructor() {
    this.nodePerformance = new Map();
    this.fastestNodeIndex = 0;
    this.lastOptimization = 0;
  }
  
  async findFastestNode() {
    // 每分钟只优化一次
    if (Date.now() - this.lastOptimization < 60000) {
      return this.fastestNodeIndex;
    }
    
    console.log('🎯 开始节点性能测试...');
    const tests = CONFIG.NODES.http.map(async (node, index) => {
      const startTime = Date.now();
      try {
        await axios.post(node.url, {
          jsonrpc: '2.0',
          method: 'eth_blockNumber',
          params: [],
          id: 1
        }, { timeout: 1500 }); // 1.5秒超时
        
        const responseTime = Date.now() - startTime;
        this.nodePerformance.set(index, responseTime);
        return { index, responseTime, success: true };
      } catch (error) {
        return { index, responseTime: 9999, success: false };
      }
    });
    
    const results = await Promise.all(tests);
    const successfulResults = results.filter(r => r.success);
    
    if (successfulResults.length > 0) {
      const fastest = successfulResults.reduce((prev, current) => 
        prev.responseTime < current.responseTime ? prev : current
      );
      
      this.fastestNodeIndex = fastest.index;
      this.lastOptimization = Date.now();
      console.log(`🎯 最快节点: ${CONFIG.NODES.http[fastest.index].name} (${fastest.responseTime}ms)`);
    }
    
    return this.fastestNodeIndex;
  }
  
  getFastestNode() {
    return CONFIG.NODES.http[this.fastestNodeIndex];
  }
}

// ==================== 极速内存缓存 ====================
class TurboCache {
  constructor() {
    this.walletCache = new Set();
    this.tokenCache = new Map();
    this.txAnalysisCache = new Map();
  }
  
  // 极速钱包检查
  isMonitoredWallet(address) {
    if (!address) return false;
    return this.walletCache.has(address.toLowerCase());
  }
  
  // 预加载钱包到内存缓存
  preloadWallets(wallets) {
    this.walletCache.clear();
    wallets.forEach(wallet => this.walletCache.add(wallet.toLowerCase()));
    console.log(`📝 预加载 ${wallets.length} 个钱包到内存缓存`);
  }
  
  // 交易分析缓存
  cacheTxAnalysis(txHash, analysis) {
    this.txAnalysisCache.set(txHash, {
      ...analysis,
      timestamp: Date.now()
    });
    
    // 5分钟后自动清理
    setTimeout(() => {
      this.txAnalysisCache.delete(txHash);
    }, 300000);
  }
  
  getTxAnalysis(txHash) {
    const cached = this.txAnalysisCache.get(txHash);
    if (cached && Date.now() - cached.timestamp < 300000) {
      return cached;
    }
    return null;
  }
}

// ==================== BSC钱包监控类 - 极致优化版 ====================
class BSCWalletMonitor {
  constructor() {
    this.isMonitoring = false;
    this.websocketConnected = false;
    this.pendingWebsocketConnected = false;
    
    // 极速组件初始化
    this.dingTalkPool = new DingTalkPool();
    this.nodeOptimizer = new NodeOptimizer();
    this.turboCache = new TurboCache();
    this.turboCache.preloadWallets(CONFIG.MONITORED_WALLETS);
    
    // 数据结构优化
    this.processedTransactions = new Set();
    this.pendingTransactions = new Map();
    this.missedBlocks = new Set();
    this.tokenCache = new Map();
    
    // 节点管理
    this.activeWsNodeIndex = 0;
    this.activeHttpNodeIndex = 0;
    
    // 极速性能统计
    this.performanceStats = {
      totalBlocksProcessed: 0,
      totalTransactionsProcessed: 0,
      totalPendingTransactions: 0,
      totalNotifications: 0,
      fastNotifications: 0,
      ultraFastNotifications: 0, // <1秒
      averageResponseTime: 0,
      lastNotificationTime: 0,
      lastProcessedBlock: 0,
      dingTalkStats: { success: 0, fail: 0 }
    };
    
    // WebSocket实例
    this.ws = null;
    this.pendingWs = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 25;
    
    console.log('🚀 BSC钱包监控系统初始化完成 - 极致优化版');
  }

  // 启动终极监控
  async startUltimateMonitoring() {
    if (this.isMonitoring) return;
    
    try {
      console.log('🚀 启动BSC钱包终极监控系统（极致优化版）...');
      
      // 并行启动所有组件
      await Promise.all([
        this.nodeOptimizer.findFastestNode(),
        this.sendStartupNotification()
      ]);
      
      // 并行启动监控
      this.startPendingTransactionMonitoring();
      this.startWebSocketMonitoring();
      this.startHttpPolling();
      this.startPerformanceMonitoring();
      this.startConnectionMonitoring();
      
      this.isMonitoring = true;
      console.log('✅ BSC钱包极致优化版已启动！');
      
    } catch (error) {
      console.error('❌ 启动监控系统失败:', error);
      setTimeout(() => this.startUltimateMonitoring(), 3000);
    }
  }

  // 🎯 核心突破：交易池监听
  startPendingTransactionMonitoring() {
    const connectPendingWebSocket = () => {
      try {
        const pendingNode = CONFIG.NODES.websocket.find(node => node.supportsPending) || CONFIG.NODES.websocket[0];
        console.log(`🔍 连接交易池监听节点: ${pendingNode.name}`);
        
        this.pendingWs = new WebSocket(pendingNode.url);
        
        this.pendingWs.on('open', () => {
          console.log('🎯 交易池监听连接已建立！');
          this.pendingWebsocketConnected = true;
          
          const subscribeMessage = {
            jsonrpc: "2.0",
            id: 1,
            method: "eth_subscribe",
            params: ["newPendingTransactions"]
          };
          
          this.pendingWs.send(JSON.stringify(subscribeMessage));
          console.log('📡 已订阅待处理交易通知');
        });
        
        this.pendingWs.on('message', (data) => {
          // 极速处理：不等待异步
          try {
            const message = JSON.parse(data.toString());
            if (message.params && message.params.result) {
              const txHash = message.params.result;
              // 立即处理，不等待
              this.handlePendingTransaction(txHash).catch(() => {});
            }
          } catch (error) {
            // 静默处理错误，不阻塞消息流
          }
        });
        
        this.pendingWs.on('error', () => {
          this.pendingWebsocketConnected = false;
        });
        
        this.pendingWs.on('close', () => {
          this.pendingWebsocketConnected = false;
          setTimeout(connectPendingWebSocket, 2000);
        });
        
      } catch (error) {
        this.pendingWebsocketConnected = false;
        setTimeout(connectPendingWebSocket, 3000);
      }
    };
    
    connectPendingWebSocket();
  }

  // 🚀 极速处理待处理交易
  async handlePendingTransaction(txHash) {
    if (this.processedTransactions.has(txHash) || this.pendingTransactions.has(txHash)) {
      return;
    }
    
    const startTime = Date.now();
    
    try {
      this.performanceStats.totalPendingTransactions++;
      
      // 极速获取交易详情
      const tx = await this.getTransactionEssential(txHash);
      if (!tx) return;
      
      // 极速钱包检查（内存级）
      const fromMonitored = this.turboCache.isMonitoredWallet(tx.from);
      const toMonitored = this.turboCache.isMonitoredWallet(tx.to);
      
      if (fromMonitored || toMonitored) {
        // 极速分析
        const analysis = this.turboAnalyzeTransaction(tx, fromMonitored);
        
        // 标记为待处理
        this.pendingTransactions.set(txHash, {
          tx: tx,
          timestamp: Date.now(),
          notified: false,
          analysis: analysis
        });
        
        // 🚀 立即发送极速通知（不等待任何后续处理）
        const notificationPromise = this.sendUltraFastNotification(tx, analysis);
        
        // 异步处理性能统计
        notificationPromise.then(responseTime => {
          if (responseTime < 1000) {
            this.performanceStats.ultraFastNotifications++;
          }
        });
        
        // 设置超时清理
        setTimeout(() => {
          this.pendingTransactions.delete(txHash);
        }, 300000);
      }
      
    } catch (error) {
      // 极速错误处理：不阻塞主流程
    }
  }

  // ⚡ 极速通知 - 突破2秒限制！
  async sendUltraFastNotification(tx, analysis) {
    const startTime = Date.now();
    const walletAddress = analysis.fromMonitored ? tx.from : tx.to;
    
    // 使用预构建模板
    const text = TurboMessageTemplates.ultraFast(
      walletAddress,
      analysis.value,
      tx.hash,
      analysis.type,
      analysis.isTokenTx,
      analysis.isTokenTx ? tx.to : ''
    );
    
    const message = {
      msgtype: 'markdown',
      markdown: {
        title: '⚡ 实时交易警报',
        text: text
      },
      at: { isAtAll: true }
    };
    
    // 使用连接池发送
    const success = await this.dingTalkPool.send(message);
    const responseTime = Date.now() - startTime;
    
    if (success) {
      this.updatePerformanceStats(responseTime);
      
      // 标记已通知
      const pendingTx = this.pendingTransactions.get(tx.hash);
      if (pendingTx) {
        pendingTx.notified = true;
      }
    }
    
    return responseTime;
  }

  // 极速交易分析
  turboAnalyzeTransaction(tx, fromMonitored) {
    const value = this.hexToEth(tx.value);
    const isTokenTx = this.isTokenTransaction(tx);
    
    let type, emoji;
    
    if (fromMonitored) {
      type = isTokenTx ? '代币转出' : 'BNB转出';
      emoji = isTokenTx ? '🪙➡️' : '📤';
    } else {
      type = isTokenTx ? '代币转入' : 'BNB转入';
      emoji = isTokenTx ? '🪙⬅️' : '📥';
    }
    
    return {
      type,
      riskLevel: 'HIGH',
      emoji,
      value,
      fromMonitored,
      isTokenTx
    };
  }

  // 极速交易数据获取
  async getTransactionEssential(txHash) {
    try {
      const tx = await this.callJsonRpc('eth_getTransactionByHash', [txHash]);
      if (!tx) return null;
      
      // 只返回必要字段
      return {
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: tx.value,
        input: tx.input
      };
    } catch (error) {
      return null;
    }
  }

  // 极速JSON-RPC调用
  async callJsonRpc(method, params) {
    const node = this.nodeOptimizer.getFastestNode();
    
    try {
      const response = await axios.post(node.url, {
        jsonrpc: '2.0',
        method: method,
        params: params,
        id: Date.now()
      }, { 
        timeout: 5000, // 5秒超时
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.data.error) {
        throw new Error(`RPC Error: ${JSON.stringify(response.data.error)}`);
      }
      
      return response.data.result;
    } catch (error) {
      // 快速失败，不重试
      throw error;
    }
  }

  // 原有的WebSocket监控（优化版）
  startWebSocketMonitoring() {
    const connectWebSocket = () => {
      try {
        const node = CONFIG.NODES.websocket[this.activeWsNodeIndex];
        this.ws = new WebSocket(node.url);
        
        this.ws.on('open', () => {
          this.websocketConnected = true;
          this.reconnectAttempts = 0;
          
          this.ws.send(JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "eth_subscribe",
            params: ["newHeads"]
          }));
        });
        
        this.ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            if (message.params && message.params.result) {
              const block = message.params.result;
              this.handleNewBlock(block);
            }
          } catch (error) {}
        });
        
        this.ws.on('error', () => {
          this.websocketConnected = false;
        });
        
        this.ws.on('close', () => {
          this.websocketConnected = false;
          setTimeout(connectWebSocket, 3000);
        });
        
      } catch (error) {
        this.websocketConnected = false;
        setTimeout(connectWebSocket, 3000);
      }
    };
    
    connectWebSocket();
  }

  // 处理新区块 - 确认交易
  async handleNewBlock(blockHeader) {
    try {
      const blockNumber = parseInt(blockHeader.number, 16);
      
      setTimeout(async () => {
        await this.processBlockByNumber(blockNumber);
      }, CONFIG.SPEED_OPTIMIZATION.blockProcessDelay);
      
    } catch (error) {}
  }

  // 处理区块确认交易
  async processBlockByNumber(blockNumber) {
    if (this.processedTransactions.has(`block_${blockNumber}`)) return;
    
    try {
      const block = await this.getBlockWithTransactions(blockNumber);
      if (!block || !block.transactions) return;
      
      this.performanceStats.totalBlocksProcessed++;
      this.performanceStats.lastProcessedBlock = blockNumber;
      
      // 并行处理交易确认
      const confirmationPromises = block.transactions.map(tx => 
        this.processTransactionConfirmation(tx, block)
      );
      
      await Promise.all(confirmationPromises);
      
      this.processedTransactions.add(`block_${blockNumber}`);
      this.cleanupMemory();
      
    } catch (error) {
      this.missedBlocks.add(blockNumber);
    }
  }

  // 处理交易确认
  async processTransactionConfirmation(tx, block) {
    try {
      if (this.pendingTransactions.has(tx.hash)) {
        const pendingTx = this.pendingTransactions.get(tx.hash);
        const analysis = pendingTx.analysis;
        
        // 发送确认通知
        await this.sendConfirmationNotification(tx, block, analysis);
        
        this.pendingTransactions.delete(tx.hash);
      }
      
      this.performanceStats.totalTransactionsProcessed++;
      this.processedTransactions.add(tx.hash);
      
    } catch (error) {}
  }

  // 发送确认通知
  async sendConfirmationNotification(tx, block, analysis) {
    const tokenInfo = analysis.isTokenTx ? await this.getTokenInfo(tx) : null;
    const walletAddress = analysis.fromMonitored ? tx.from : tx.to;
    
    const text = TurboMessageTemplates.confirmed(
      walletAddress,
      analysis.value,
      tx.hash,
      block.number,
      analysis.type,
      tokenInfo
    );
    
    const message = {
      msgtype: 'markdown',
      markdown: {
        title: '✅ 交易确认完成',
        text: text
      },
      at: { isAtAll: false }
    };
    
    await this.dingTalkPool.send(message);
  }

  // 工具方法
  hexToEth(hexValue) {
    try {
      if (!hexValue || hexValue === '0x') return '0';
      const hex = hexValue.startsWith('0x') ? hexValue.slice(2) : hexValue;
      if (hex.length === 0) return '0';
      const wei = BigInt('0x' + hex);
      const eth = Number(wei) / 1e18;
      if (eth === 0) return '0';
      if (eth < 0.0001) return eth.toFixed(8);
      if (eth < 1) return eth.toFixed(6);
      return eth.toFixed(4);
    } catch (error) {
      return '0';
    }
  }

  isTokenTransaction(tx) {
    if (!tx.input || tx.input === '0x') return false;
    const isTokenTransfer = tx.input.startsWith('0xa9059cbb') || tx.input.startsWith('0x23b872dd');
    const isContractCall = tx.input.length > 20 && (tx.value === '0x0' || tx.value === '0x');
    return isTokenTransfer || isContractCall;
  }

  async getTokenInfo(tx) {
    if (!tx.to || this.tokenCache.has(tx.to)) {
      return this.tokenCache.get(tx.to);
    }
    
    try {
      const [nameData, symbolData] = await Promise.all([
        this.callJsonRpc('eth_call', [{ to: tx.to, data: '0x06fdde03' }, 'latest']),
        this.callJsonRpc('eth_call', [{ to: tx.to, data: '0x95d89b41' }, 'latest'])
      ]);
      
      const name = nameData && nameData !== '0x' ? this.hexToString(nameData) : 'Unknown Token';
      const symbol = symbolData && symbolData !== '0x' ? this.hexToString(symbolData) : 'UNKNOWN';
      
      const tokenInfo = { name, symbol, address: tx.to };
      this.tokenCache.set(tx.to, tokenInfo);
      
      setTimeout(() => this.tokenCache.delete(tx.to), 300000);
      
      return tokenInfo;
    } catch (error) {
      return null;
    }
  }

  hexToString(hex) {
    try {
      if (!hex || hex === '0x') return '';
      let str = '';
      for (let i = 2; i < hex.length; i += 2) {
        const charCode = parseInt(hex.substr(i, 2), 16);
        if (charCode > 0) str += String.fromCharCode(charCode);
      }
      return str.replace(/\0/g, '').trim();
    } catch (error) {
      return 'Unknown';
    }
  }

  updatePerformanceStats(responseTime) {
    this.performanceStats.totalNotifications++;
    this.performanceStats.lastNotificationTime = responseTime;
    
    if (responseTime <= CONFIG.SPEED_OPTIMIZATION.targetNotificationTime) {
      this.performanceStats.fastNotifications++;
    }
    
    this.performanceStats.averageResponseTime = 
      (this.performanceStats.averageResponseTime * (this.performanceStats.totalNotifications - 1) + responseTime) 
      / this.performanceStats.totalNotifications;
  }

  // 启动HTTP轮询作为备份
  startHttpPolling() {
    let lastBlock = 0;
    const pollBlocks = async () => {
      if (!this.websocketConnected) {
        try {
          const currentBlock = await this.getCurrentBlockNumber();
          if (currentBlock && currentBlock > lastBlock) {
            if (lastBlock > 0) {
              for (let blockNumber = lastBlock + 1; blockNumber <= currentBlock; blockNumber++) {
                await this.processBlockByNumber(blockNumber);
              }
            }
            lastBlock = currentBlock;
          }
        } catch (error) {}
      }
      setTimeout(pollBlocks, this.websocketConnected ? 3000 : 1500);
    };
    
    this.getCurrentBlockNumber().then(blockNumber => {
      lastBlock = blockNumber || 0;
      pollBlocks();
    });
  }

  async getCurrentBlockNumber() {
    try {
      const blockNumberHex = await this.callJsonRpc('eth_blockNumber', []);
      return parseInt(blockNumberHex, 16);
    } catch (error) {
      return 0;
    }
  }

  async getBlockWithTransactions(blockNumber) {
    try {
      const blockHex = '0x' + blockNumber.toString(16);
      return await this.callJsonRpc('eth_getBlockByNumber', [blockHex, true]);
    } catch (error) {
      return null;
    }
  }

  startPerformanceMonitoring() {
    setInterval(() => {
      const stats = this.performanceStats;
      const dingTalkStats = this.dingTalkPool.getStats();
      const fastRate = stats.totalNotifications > 0 ? 
        (stats.fastNotifications / stats.totalNotifications * 100).toFixed(1) : 0;
      const ultraFastRate = stats.totalNotifications > 0 ?
        (stats.ultraFastNotifications / stats.totalNotifications * 100).toFixed(1) : 0;
      
      console.log(`🎯 极致性能: 区块${stats.totalBlocksProcessed}, 交易池${stats.totalPendingTransactions}, 通知${stats.totalNotifications}, 极速${stats.fastNotifications}, 超极速${stats.ultraFastNotifications}, 极速率${fastRate}%, 超极速率${ultraFastRate}%`);
      console.log(`📤 钉钉统计: 成功${dingTalkStats.successCount}, 失败${dingTalkStats.failCount}, 队列${dingTalkStats.queueLength}`);
    }, 30000);
  }

  startConnectionMonitoring() {
    setInterval(() => {
      this.nodeOptimizer.findFastestNode().catch(() => {});
    }, 120000); // 每2分钟优化一次节点
  }

  cleanupMemory() {
    const currentSize = this.processedTransactions.size;
    if (currentSize > CONFIG.SPEED_OPTIMIZATION.cacheSize.transactions * 1.5) {
      const toDelete = currentSize - CONFIG.SPEED_OPTIMIZATION.cacheSize.transactions;
      let deleted = 0;
      for (const key of this.processedTransactions) {
        this.processedTransactions.delete(key);
        if (++deleted >= toDelete) break;
      }
    }
  }

  async sendStartupNotification() {
    const message = {
      msgtype: 'markdown',
      markdown: {
        title: '🚀 BSC终极监控启动',
        text: `### 🛡️ BSC钱包终极监控系统已启动\n\n**版本**: 极致优化版\n**启动时间**: ${new Date().toLocaleString('zh-CN')}\n**监控钱包**: ${CONFIG.MONITORED_WALLETS.length}个\n**目标响应**: ≤2秒\n**技术突破**: \n- ⚡ 交易池实时监听\n- 🚀 极速通知优化\n- 📦 预构建消息模板\n- 🔗 连接池并发处理\n- 🎯 智能节点选择\n\n💡 系统已开始极致速度监控！`
      },
      at: { isAtAll: false }
    };
    await this.dingTalkPool.send(message);
  }

  getMonitoredWallets() { return [...CONFIG.MONITORED_WALLETS]; }
  addWallet(walletAddress) {
    const address = walletAddress.toLowerCase();
    if (!CONFIG.MONITORED_WALLETS.includes(address)) {
      CONFIG.MONITORED_WALLETS.push(address);
      this.turboCache.preloadWallets(CONFIG.MONITORED_WALLETS);
      return true;
    }
    return false;
  }
  removeWallet(walletAddress) {
    const address = walletAddress.toLowerCase();
    const index = CONFIG.MONITORED_WALLETS.indexOf(address);
    if (index > -1) {
      CONFIG.MONITORED_WALLETS.splice(index, 1);
      this.turboCache.preloadWallets(CONFIG.MONITORED_WALLETS);
      return true;
    }
    return false;
  }

  getSystemStatus() {
    const stats = this.performanceStats;
    const dingTalkStats = this.dingTalkPool.getStats();
    const fastRate = stats.totalNotifications > 0 ? 
      (stats.fastNotifications / stats.totalNotifications * 100).toFixed(1) : 0;
    const ultraFastRate = stats.totalNotifications > 0 ?
      (stats.ultraFastNotifications / stats.totalNotifications * 100).toFixed(1) : 0;
    
    return {
      isMonitoring: this.isMonitoring,
      websocketConnected: this.websocketConnected,
      pendingWebsocketConnected: this.pendingWebsocketConnected,
      monitoredWallets: CONFIG.MONITORED_WALLETS.length,
      processedTransactions: this.processedTransactions.size,
      pendingTransactions: this.pendingTransactions.size,
      performance: {
        totalBlocks: stats.totalBlocksProcessed,
        totalTransactions: stats.totalTransactionsProcessed,
        totalPendingTransactions: stats.totalPendingTransactions,
        totalNotifications: stats.totalNotifications,
        fastNotifications: stats.fastNotifications,
        ultraFastNotifications: stats.ultraFastNotifications,
        fastRate: fastRate + '%',
        ultraFastRate: ultraFastRate + '%',
        averageResponseTime: stats.averageResponseTime.toFixed(0) + 'ms',
        lastNotificationTime: stats.lastNotificationTime + 'ms',
        lastProcessedBlock: stats.lastProcessedBlock,
        dingTalkStats: dingTalkStats
      }
    };
  }
}

// ==================== Express服务器 ====================
const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 3000;
const walletMonitor = new BSCWalletMonitor();

// 路由
app.get('/', (req, res) => {
  res.json({ 
    status: '运行中', 
    service: 'BSC钱包终极监控系统',
    version: '极致优化版',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    monitoring: walletMonitor.isMonitoring
  });
});

app.get('/status', (req, res) => {
  const status = walletMonitor.getSystemStatus();
  res.json(status);
});

// 管理API
app.get('/api/wallets', (req, res) => {
  res.json({
    success: true,
    data: walletMonitor.getMonitoredWallets(),
    count: walletMonitor.getMonitoredWallets().length
  });
});

app.post('/api/wallets', (req, res) => {
  const { walletAddress } = req.body;
  if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    return res.status(400).json({ success: false, message: '无效的钱包地址' });
  }
  const added = walletMonitor.addWallet(walletAddress);
  if (added) {
    res.json({ success: true, message: '钱包添加成功', data: walletMonitor.getMonitoredWallets() });
  } else {
    res.status(409).json({ success: false, message: '钱包已在监控列表中' });
  }
});

app.delete('/api/wallets/:address', (req, res) => {
  const removed = walletMonitor.removeWallet(req.params.address);
  if (removed) {
    res.json({ success: true, message: '钱包移除成功', data: walletMonitor.getMonitoredWallets() });
  } else {
    res.status(404).json({ success: false, message: '钱包不在监控列表中' });
  }
});

// 管理界面
app.get('/admin', (req, res) => {
  const status = walletMonitor.getSystemStatus();
  const wallets = walletMonitor.getMonitoredWallets();
  
  res.send(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BSC钱包终极监控系统</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1000px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #333; border-bottom: 2px solid #eee; padding-bottom: 10px; }
        .status-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
        .status-card { background: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #007bff; }
        .performance-card { background: #e8f5e8; border-left-color: #28a745; }
        .breakthrough-card { background: #e3f2fd; border-left-color: #2196f3; }
        .speed-indicator { 
            background: #4CAF50; color: white; padding: 15px; border-radius: 8px; 
            text-align: center; font-size: 20px; font-weight: bold; margin: 20px 0;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        }
        .ultra-fast { background: linear-gradient(45deg, #4CAF50, #45a049); }
        .fast { background: linear-gradient(45deg, #ff9800, #ff5722); }
        .slow { background: linear-gradient(45deg, #f44336, #d32f2f); }
        .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 10px 0; }
        .stat-item { text-align: center; padding: 8px; background: white; border-radius: 4px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🛡️ BSC钱包终极监控系统 - 极致优化版</h1>
        
        <div class="speed-indicator ${parseInt(status.performance.lastNotificationTime) <= 1000 ? 'ultra-fast' : parseInt(status.performance.lastNotificationTime) <= 3000 ? 'fast' : 'slow'}">
            ⚡ 目标: 2秒内通知 | 最后响应: ${status.performance.lastNotificationTime} | 极速率: ${status.performance.fastRate} | 超极速率: ${status.performance.ultraFastRate}
        </div>
        
        <div class="status-grid">
            <div class="status-card performance-card">
                <h3>📊 极致性能统计</h3>
                <div class="stats-grid">
                    <div class="stat-item">
                        <div style="font-size: 24px; font-weight: bold;">${status.performance.totalPendingTransactions}</div>
                        <div>交易池检测</div>
                    </div>
                    <div class="stat-item">
                        <div style="font-size: 24px; font-weight: bold;">${status.performance.ultraFastNotifications}</div>
                        <div>超极速通知</div>
                    </div>
                    <div class="stat-item">
                        <div style="font-size: 24px; font-weight: bold;">${status.performance.totalNotifications}</div>
                        <div>总通知数</div>
                    </div>
                </div>
                <p><strong>平均响应:</strong> ${status.performance.averageResponseTime}</p>
                <p><strong>极速通知:</strong> ${status.performance.fastNotifications}</p>
                <p><strong>超极速通知:</strong> ${status.performance.ultraFastNotifications}</p>
            </div>
            
            <div class="status-card breakthrough-card">
                <h3>🚀 极致优化特性</h3>
                <p>✅ 交易池实时监听</p>
                <p>✅ 预构建消息模板</p>
                <p>✅ 钉钉连接池并发</p>
                <p>✅ 智能节点选择</p>
                <p>✅ 极速内存缓存</p>
                <p>✅ 并行处理优化</p>
            </div>
        </div>
        
        <div style="margin: 20px 0;">
            <h3>👛 监控的钱包地址</h3>
            ${wallets.map(wallet => `
                <div style="background: #f9f9f9; padding: 10px; margin: 5px 0; border-radius: 4px; border-left: 4px solid #4CAF50; display: flex; justify-content: space-between; align-items: center;">
                    <code>${wallet}</code>
                    <button style="background: #f44336; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;" onclick="removeWallet('${wallet}')">删除</button>
                </div>
            `).join('')}
        </div>
        
        <div style="margin: 20px 0;">
            <h3>➕ 添加监控钱包</h3>
            <input type="text" id="walletAddress" placeholder="输入BSC钱包地址 (0x...)" style="width: 70%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 16px; margin-right: 10px;" />
            <button style="background: #4CAF50; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer;" onclick="addWallet()">添加钱包</button>
        </div>
    </div>

    <script>
        async function addWallet() {
            const address = document.getElementById('walletAddress').value.trim();
            if (!address) {
                alert('请输入钱包地址');
                return;
            }
            
            try {
                const response = await fetch('/api/wallets', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ walletAddress: address })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    alert('钱包添加成功');
                    location.reload();
                } else {
                    alert('添加失败: ' + result.message);
                }
            } catch (error) {
                alert('网络错误: ' + error.message);
            }
        }
        
        async function removeWallet(address) {
            if (!confirm('确定要移除这个监控钱包吗？')) return;
            
            try {
                const response = await fetch('/api/wallets/' + encodeURIComponent(address), {
                    method: 'DELETE'
                });
                
                const result = await response.json();
                
                if (result.success) {
                    alert('钱包移除成功');
                    location.reload();
                } else {
                    alert('移除失败: ' + result.message);
                }
            } catch (error) {
                alert('网络错误: ' + error.message);
            }
        }
        
        // 自动刷新状态
        setInterval(() => {
            fetch('/status')
                .then(response => response.json())
                .then(status => {
                    const indicator = document.querySelector('.speed-indicator');
                    indicator.innerHTML = \`⚡ 目标: 2秒内通知 | 最后响应: \${status.performance.lastNotificationTime} | 极速率: \${status.performance.fastRate} | 超极速率: \${status.performance.ultraFastRate}\`;
                    indicator.className = 'speed-indicator ' + 
                        (parseInt(status.performance.lastNotificationTime) <= 1000 ? 'ultra-fast' : 
                         parseInt(status.performance.lastNotificationTime) <= 3000 ? 'fast' : 'slow');
                });
        }, 2000);
    </script>
</body>
</html>
  `);
});

// 启动服务器
app.listen(PORT, () => {
  console.log('='.repeat(70));
  console.log('🚀 BSC钱包终极监控系统 - 极致优化版 启动成功!');
  console.log('🎯 技术突破：实现秒级交易检测！');
  console.log(`📍 服务地址: http://localhost:${PORT}`);
  console.log(`🔧 管理界面: http://localhost:${PORT}/admin`);
  console.log('⚡ 极致优化特性:');
  console.log(`   - 🚀 预构建消息模板（减少字符串操作）`);
  console.log(`   - 🔗 钉钉连接池并发（3路并发发送）`);
  console.log(`   - 🎯 智能节点选择（自动选择最快节点）`);
  console.log(`   - 📦 极速内存缓存（内存级钱包检查）`);
  console.log(`   - ⚡ 并行处理优化（减少等待时间）`);
  console.log(`   - 🔥 交易池实时监听（突破2秒限制）`);
  console.log('='.repeat(70));
  
  setTimeout(() => {
    walletMonitor.startUltimateMonitoring().catch(error => {
      console.error('❌ 监控系统启动失败:', error);
    });
  }, 2000);
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n👋 收到关闭信号，正在优雅退出...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 收到终止信号，正在优雅退出...');
  process.exit(0);
});
