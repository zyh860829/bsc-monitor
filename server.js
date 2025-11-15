const express = require('express');
const cors = require('cors');
const axios = require('axios');
const WebSocket = require('ws');

// ==================== 配置信息 ====================
const CONFIG = {
  DINGTALK_WEBHOOK: 'https://oapi.dingtalk.com/robot/send?access_token=d5d287f2356ab6bfa343bd2300fee541d0066505f938871992872ffc7db7a2c8',
  
  MONITORED_WALLETS: [
    '0x242baea6afbacde994817805db8b5c020a665811',
    '0xd1963eaa57432147b658de28c762cae79f2c8308'
  ].map(addr => addr.toLowerCase()),
  
  NODES: {
    websocket: [
      {
        url: 'wss://bsc-ws-node.nariox.org:443',
        name: 'Binance Official'
      },
      {
        url: 'wss://bsc-mainnet.nodereal.io/ws',
        name: 'NodeReal WS'
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
      }
    ]
  }
};

// ==================== 诊断版监控类 ====================
class BSCWalletMonitor {
  constructor() {
    this.isMonitoring = false;
    this.websocketConnected = false;
    this.monitoredWalletsSet = new Set(CONFIG.MONITORED_WALLETS);
    this.processedTransactions = new Set();
    this.missedBlocks = new Set();
    this.tokenCache = new Map();
    
    // 诊断数据
    this.diagnosticData = {
      lastBlockProcessed: null,
      lastTransactionFound: null,
      lastNotificationSent: null,
      connectionAttempts: 0,
      errors: [],
      webSocketMessages: []
    };
    
    this.activeWsNodeIndex = 0;
    this.activeHttpNodeIndex = 0;
    
    this.performanceStats = {
      totalBlocksProcessed: 0,
      totalTransactionsProcessed: 0,
      totalNotifications: 0,
      fastNotifications: 0,
      averageResponseTime: 0,
      lastNotificationTime: 0,
      lastProcessedBlock: 0
    };
    
    this.ws = null;
    
    console.log('🔍 BSC钱包监控系统初始化完成 - 诊断模式');
  }

  // 记录诊断信息
  logDiagnostic(type, message, data = null) {
    const entry = {
      timestamp: new Date().toISOString(),
      type,
      message,
      data
    };
    
    this.diagnosticData.webSocketMessages.push(entry);
    
    // 保持最近100条消息
    if (this.diagnosticData.webSocketMessages.length > 100) {
      this.diagnosticData.webSocketMessages.shift();
    }
    
    console.log(`🔍 [${type}] ${message}`, data || '');
  }

  // 启动监控
  async startMonitoring() {
    if (this.isMonitoring) return;
    
    try {
      this.logDiagnostic('SYSTEM', '启动监控系统');
      
      await this.sendStartupNotification();
      this.startWebSocketMonitoring();
      this.startHttpPolling();
      this.startPerformanceMonitoring();
      
      this.isMonitoring = true;
      this.logDiagnostic('SYSTEM', '监控系统启动成功');
      
    } catch (error) {
      this.logDiagnostic('ERROR', '启动监控系统失败', error.message);
      setTimeout(() => this.startMonitoring(), 5000);
    }
  }

  // WebSocket监控 - 增强诊断
  startWebSocketMonitoring() {
    const connectWebSocket = () => {
      try {
        const node = CONFIG.NODES.websocket[this.activeWsNodeIndex];
        this.logDiagnostic('CONNECTION', `连接WebSocket节点: ${node.name}`, { url: node.url });
        
        this.ws = new WebSocket(node.url);
        
        this.ws.on('open', () => {
          this.logDiagnostic('CONNECTION', 'WebSocket连接成功');
          this.websocketConnected = true;
          this.diagnosticData.connectionAttempts++;
          
          const subscribeMessage = {
            jsonrpc: "2.0",
            id: 1,
            method: "eth_subscribe",
            params: ["newHeads"]
          };
          
          this.ws.send(JSON.stringify(subscribeMessage));
          this.logDiagnostic('SUBSCRIPTION', '发送区块订阅请求');
        });
        
        this.ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            this.logDiagnostic('MESSAGE', '收到WebSocket消息', { 
              type: message.method || 'unknown',
              hasResult: !!message.result,
              hasParams: !!(message.params && message.params.result)
            });
            
            if (message.params && message.params.result) {
              const block = message.params.result;
              const blockNumber = parseInt(block.number, 16);
              this.logDiagnostic('BLOCK', `收到新区块头: ${blockNumber}`);
              this.handleNewBlock(block);
            }
            
            // 处理订阅确认
            if (message.result && typeof message.result === 'string') {
              this.logDiagnostic('SUBSCRIPTION', `订阅成功: ${message.result}`);
            }
            
          } catch (error) {
            this.logDiagnostic('ERROR', '处理WebSocket消息失败', error.message);
          }
        });
        
        this.ws.on('error', (error) => {
          this.logDiagnostic('ERROR', 'WebSocket连接错误', error.message);
          this.websocketConnected = false;
        });
        
        this.ws.on('close', (code, reason) => {
          this.logDiagnostic('CONNECTION', `WebSocket连接关闭`, { code, reason });
          this.websocketConnected = false;
          setTimeout(connectWebSocket, 3000);
        });
        
      } catch (error) {
        this.logDiagnostic('ERROR', 'WebSocket连接异常', error.message);
        this.websocketConnected = false;
        setTimeout(connectWebSocket, 5000);
      }
    };
    
    connectWebSocket();
  }

  // HTTP轮询备份 - 增强诊断
  startHttpPolling() {
    let lastBlock = 0;
    
    const pollBlocks = async () => {
      if (!this.websocketConnected) {
        try {
          this.logDiagnostic('POLLING', '开始HTTP轮询检查新区块');
          const currentBlock = await this.getCurrentBlockNumber();
          
          this.logDiagnostic('POLLING', `当前区块: ${currentBlock}, 上次区块: ${lastBlock}`);
          
          if (currentBlock && currentBlock > lastBlock) {
            if (lastBlock > 0) {
              this.logDiagnostic('POLLING', `发现新区块范围: ${lastBlock + 1} - ${currentBlock}`);
              for (let blockNumber = lastBlock + 1; blockNumber <= currentBlock; blockNumber++) {
                await this.processBlockByNumber(blockNumber);
              }
            }
            lastBlock = currentBlock;
          }
        } catch (error) {
          this.logDiagnostic('ERROR', 'HTTP轮询失败', error.message);
        }
      }
      setTimeout(pollBlocks, 4000);
    };
    
    this.getCurrentBlockNumber().then(blockNumber => {
      lastBlock = blockNumber;
      this.logDiagnostic('POLLING', `初始区块高度: ${lastBlock}`);
      pollBlocks();
    }).catch(error => {
      this.logDiagnostic('ERROR', '获取初始区块高度失败', error.message);
    });
  }

  // 处理新区块 - 增强诊断
  async handleNewBlock(blockHeader) {
    try {
      const blockNumber = parseInt(blockHeader.number, 16);
      this.logDiagnostic('BLOCK', `开始处理新区块: ${blockNumber}`);
      
      if (isNaN(blockNumber)) {
        this.logDiagnostic('ERROR', '无效的区块号', blockHeader);
        return;
      }
      
      setTimeout(async () => {
        await this.processBlockByNumber(blockNumber);
      }, 1000);
      
    } catch (error) {
      this.logDiagnostic('ERROR', '处理新区块失败', error.message);
    }
  }

  // 处理区块 - 增强诊断
  async processBlockByNumber(blockNumber) {
    if (this.processedTransactions.has(`block_${blockNumber}`)) {
      this.logDiagnostic('BLOCK', `区块 ${blockNumber} 已处理过，跳过`);
      return;
    }
    
    try {
      this.logDiagnostic('BLOCK', `获取区块 ${blockNumber} 的完整数据`);
      const block = await this.getBlockWithTransactions(blockNumber);
      
      if (!block) {
        this.logDiagnostic('ERROR', `无法获取区块 ${blockNumber} 数据`);
        return;
      }
      
      if (!block.transactions) {
        this.logDiagnostic('BLOCK', `区块 ${blockNumber} 没有交易数据`);
        return;
      }
      
      this.performanceStats.totalBlocksProcessed++;
      this.performanceStats.lastProcessedBlock = blockNumber;
      this.diagnosticData.lastBlockProcessed = {
        blockNumber,
        timestamp: new Date().toISOString(),
        transactionCount: block.transactions.length
      };
      
      this.logDiagnostic('BLOCK', `扫描区块 ${blockNumber}, 交易数: ${block.transactions.length}`);
      
      let relevantTransactions = 0;
      
      for (const tx of block.transactions) {
        const isRelevant = await this.processTransaction(tx, block);
        if (isRelevant) relevantTransactions++;
      }
      
      this.logDiagnostic('BLOCK', `区块 ${blockNumber} 处理完成，相关交易: ${relevantTransactions}/${block.transactions.length}`);
      
      this.processedTransactions.add(`block_${blockNumber}`);
      
    } catch (error) {
      this.logDiagnostic('ERROR', `处理区块 ${blockNumber} 失败`, error.message);
      this.missedBlocks.add(blockNumber);
    }
  }

  // 处理交易 - 增强诊断
  async processTransaction(tx, block) {
    const startTime = Date.now();
    
    try {
      if (this.processedTransactions.has(tx.hash)) {
        return false;
      }
      
      this.performanceStats.totalTransactionsProcessed++;
      
      const from = tx.from ? tx.from.toLowerCase() : '';
      const to = tx.to ? tx.to.toLowerCase() : '';
      
      const fromMonitored = this.monitoredWalletsSet.has(from);
      const toMonitored = this.monitoredWalletsSet.has(to);
      
      this.logDiagnostic('TRANSACTION', `检查交易`, {
        hash: tx.hash.substring(0, 16) + '...',
        from: from.substring(0, 10) + '...',
        to: to.substring(0, 10) + '...',
        fromMonitored,
        toMonitored,
        value: this.hexToEth(tx.value)
      });
      
      if (fromMonitored || toMonitored) {
        this.logDiagnostic('DETECTION', `🎯 发现相关交易`, {
          hash: tx.hash,
          from,
          to,
          fromMonitored,
          toMonitored,
          direction: fromMonitored ? '转出' : '转入'
        });
        
        const analysis = this.analyzeTransaction(tx, fromMonitored);
        await this.sendNotification(tx, block, analysis);
        
        const responseTime = Date.now() - startTime;
        this.updatePerformanceStats(responseTime);
        
        this.diagnosticData.lastTransactionFound = {
          hash: tx.hash,
          block: block.number,
          direction: fromMonitored ? 'OUT' : 'IN',
          timestamp: new Date().toISOString(),
          responseTime
        };
        
        this.logDiagnostic('NOTIFICATION', `交易通知完成`, { responseTime: `${responseTime}ms` });
        
        return true;
      }
      
      this.processedTransactions.add(tx.hash);
      return false;
      
    } catch (error) {
      this.logDiagnostic('ERROR', `处理交易失败`, {
        hash: tx.hash,
        error: error.message
      });
      return false;
    }
  }

  // 分析交易
  analyzeTransaction(tx, fromMonitored) {
    const value = this.hexToEth(tx.value);
    const isTokenTx = tx.input && tx.input !== '0x' && tx.input.length > 10;
    
    let type, riskLevel, emoji;
    
    if (fromMonitored) {
      type = isTokenTx ? '代币转出' : 'BNB转出';
      riskLevel = value > 1 ? 'HIGH' : 'MEDIUM';
      emoji = value > 1 ? '🚨' : '📤';
    } else {
      type = isTokenTx ? '代币转入' : 'BNB转入';
      riskLevel = value > 1 ? 'HIGH' : 'MEDIUM';
      emoji = value > 1 ? '🎉' : '📥';
    }
    
    this.logDiagnostic('ANALYSIS', `交易分析完成`, {
      type,
      riskLevel,
      value,
      isTokenTx,
      fromMonitored
    });
    
    return { type, riskLevel, emoji, value, fromMonitored, isTokenTx };
  }

  // 发送通知 - 增强诊断
  async sendNotification(tx, block, analysis) {
    const startTime = Date.now();
    
    try {
      const walletAddress = analysis.fromMonitored ? tx.from : tx.to;
      
      let text = `### ${analysis.emoji} BSC交易监控\n\n` +
                 `**${analysis.type}** | ${analysis.riskLevel}风险\n\n` +
                 `**钱包地址**: \`${walletAddress}\`\n` +
                 `**金额**: ${analysis.value} BNB\n` +
                 `**交易哈希**: \`${tx.hash}\`\n` +
                 `**区块**: ${block.number}\n\n`;
      
      if (analysis.isTokenTx) {
        const tokenInfo = await this.getTokenInfo(tx);
        if (tokenInfo) {
          text += `**代币**: ${tokenInfo.name} (${tokenInfo.symbol})\n` +
                  `**合约地址**: \`${tokenInfo.address}\`\n\n`;
        }
      }
      
      text += `🔗 **快速链接**\n` +
              `• [查看交易](https://bscscan.com/tx/${tx.hash})\n` +
              `• [查看钱包](https://bscscan.com/address/${walletAddress})`;
      
      const at = analysis.riskLevel === 'HIGH' ? { isAtAll: true } : { isAtAll: false };
      
      const message = {
        msgtype: 'markdown',
        markdown: { title: `${analysis.emoji} 交易提醒`, text },
        at
      };
      
      this.logDiagnostic('NOTIFICATION', '发送钉钉通知', {
        wallet: walletAddress.substring(0, 10) + '...',
        type: analysis.type,
        value: analysis.value
      });
      
      const success = await this.sendDingTalk(message);
      const responseTime = Date.now() - startTime;
      
      if (success) {
        this.diagnosticData.lastNotificationSent = {
          timestamp: new Date().toISOString(),
          wallet: walletAddress,
          type: analysis.type,
          responseTime,
          block: block.number
        };
      }
      
      return success;
      
    } catch (error) {
      this.logDiagnostic('ERROR', '发送通知失败', error.message);
      return false;
    }
  }

  // 钉钉发送
  async sendDingTalk(message) {
    try {
      const response = await axios.post(CONFIG.DINGTALK_WEBHOOK, message, { timeout: 5000 });
      if (response.data.errcode === 0) {
        this.logDiagnostic('NOTIFICATION', '钉钉通知发送成功');
        return true;
      } else {
        this.logDiagnostic('ERROR', '钉钉通知发送失败', response.data);
        return false;
      }
    } catch (error) {
      this.logDiagnostic('ERROR', '钉钉请求失败', error.message);
      return false;
    }
  }

  // 工具方法
  async callJsonRpc(method, params) {
    const node = CONFIG.NODES.http[this.activeHttpNodeIndex];
    try {
      this.logDiagnostic('RPC', `调用JSON-RPC: ${method}`, { params });
      
      const response = await axios.post(node.url, {
        jsonrpc: '2.0', method, params, id: 1
      }, { timeout: 10000 });
      
      this.logDiagnostic('RPC', `RPC调用成功: ${method}`);
      return response.data.result;
      
    } catch (error) {
      this.logDiagnostic('ERROR', `RPC调用失败: ${method}`, error.message);
      throw error;
    }
  }

  async getCurrentBlockNumber() {
    try {
      const blockNumberHex = await this.callJsonRpc('eth_blockNumber', []);
      const blockNumber = parseInt(blockNumberHex, 16);
      this.logDiagnostic('RPC', `当前区块号: ${blockNumber}`);
      return blockNumber;
    } catch (error) {
      this.logDiagnostic('ERROR', '获取当前区块号失败', error.message);
      return 0;
    }
  }

  async getBlockWithTransactions(blockNumber) {
    try {
      const blockHex = '0x' + blockNumber.toString(16);
      const block = await this.callJsonRpc('eth_getBlockByNumber', [blockHex, true]);
      
      if (block && block.transactions) {
        this.logDiagnostic('RPC', `获取区块成功`, {
          blockNumber,
          transactionCount: block.transactions.length
        });
      }
      
      return block;
    } catch (error) {
      this.logDiagnostic('ERROR', `获取区块失败: ${blockNumber}`, error.message);
      return null;
    }
  }

  async getTokenInfo(tx) {
    if (!tx.to) return null;
    try {
      this.logDiagnostic('TOKEN', `获取代币信息: ${tx.to.substring(0, 10)}...`);
      
      const [nameData, symbolData] = await Promise.all([
        this.callJsonRpc('eth_call', [{ to: tx.to, data: '0x06fdde03' }, 'latest']),
        this.callJsonRpc('eth_call', [{ to: tx.to, data: '0x95d89b41' }, 'latest'])
      ]);
      
      const name = nameData && nameData !== '0x' ? this.hexToString(nameData) : 'Unknown';
      const symbol = symbolData && symbolData !== '0x' ? this.hexToString(symbolData) : 'UNKNOWN';
      
      this.logDiagnostic('TOKEN', `代币信息获取成功`, { name, symbol });
      
      return { name, symbol, address: tx.to };
    } catch (error) {
      this.logDiagnostic('ERROR', '获取代币信息失败', error.message);
      return null;
    }
  }

  hexToEth(hexValue) {
    try {
      if (!hexValue || hexValue === '0x') return '0';
      const hex = hexValue.startsWith('0x') ? hexValue.slice(2) : hexValue;
      if (hex.length === 0) return '0';
      const wei = BigInt('0x' + hex);
      const eth = Number(wei) / 1e18;
      return eth.toFixed(6);
    } catch (error) {
      return '0';
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
      return str.replace(/\0/g, '');
    } catch (error) {
      return 'Unknown';
    }
  }

  updatePerformanceStats(responseTime) {
    this.performanceStats.totalNotifications++;
    this.performanceStats.lastNotificationTime = responseTime;
    
    if (responseTime <= 5000) {
      this.performanceStats.fastNotifications++;
    }
    
    this.performanceStats.averageResponseTime = 
      (this.performanceStats.averageResponseTime * (this.performanceStats.totalNotifications - 1) + responseTime) 
      / this.performanceStats.totalNotifications;
  }

  startPerformanceMonitoring() {
    setInterval(() => {
      const stats = this.performanceStats;
      const fastRate = stats.totalNotifications > 0 ? 
        (stats.fastNotifications / stats.totalNotifications * 100).toFixed(1) : 0;
      
      this.logDiagnostic('PERFORMANCE', '性能统计', {
        blocks: stats.totalBlocksProcessed,
        transactions: stats.totalTransactionsProcessed,
        notifications: stats.totalNotifications,
        fastRate: `${fastRate}%`,
        avgResponse: `${stats.averageResponseTime.toFixed(0)}ms`
      });
    }, 30000);
  }

  async sendStartupNotification() {
    const message = {
      msgtype: 'markdown',
      markdown: {
        title: '🚀 BSC监控启动',
        text: `### 🛡️ BSC钱包监控系统已启动\n\n**版本**: 诊断版\n**时间**: ${new Date().toLocaleString('zh-CN')}\n**监控钱包**: ${CONFIG.MONITORED_WALLETS.length}个\n**模式**: 详细诊断模式`
      },
      at: { isAtAll: false }
    };
    await this.sendDingTalk(message);
  }

  // 钱包管理
  getMonitoredWallets() {
    return [...CONFIG.MONITORED_WALLETS];
  }

  addWallet(walletAddress) {
    const address = walletAddress.toLowerCase();
    if (!CONFIG.MONITORED_WALLETS.includes(address)) {
      CONFIG.MONITORED_WALLETS.push(address);
      this.monitoredWalletsSet.add(address);
      this.logDiagnostic('WALLET', `添加监控钱包`, { address });
      return true;
    }
    this.logDiagnostic('WALLET', `钱包已存在`, { address });
    return false;
  }

  removeWallet(walletAddress) {
    const address = walletAddress.toLowerCase();
    const index = CONFIG.MONITORED_WALLETS.indexOf(address);
    if (index > -1) {
      CONFIG.MONITORED_WALLETS.splice(index, 1);
      this.monitoredWalletsSet.delete(address);
      this.logDiagnostic('WALLET', `移除监控钱包`, { address });
      return true;
    }
    return false;
  }

  getSystemStatus() {
    const stats = this.performanceStats;
    const fastRate = stats.totalNotifications > 0 ? 
      (stats.fastNotifications / stats.totalNotifications * 100).toFixed(1) : 0;
    
    return {
      isMonitoring: this.isMonitoring,
      websocketConnected: this.websocketConnected,
      monitoredWallets: CONFIG.MONITORED_WALLETS.length,
      processedTransactions: this.processedTransactions.size,
      missedBlocks: this.missedBlocks.size,
      activeWsNode: CONFIG.NODES.websocket[this.activeWsNodeIndex]?.name || 'Unknown',
      activeHttpNode: CONFIG.NODES.http[this.activeHttpNodeIndex]?.name || 'Unknown',
      performance: {
        totalBlocks: stats.totalBlocksProcessed,
        totalTransactions: stats.totalTransactionsProcessed,
        totalNotifications: stats.totalNotifications,
        fastNotifications: stats.fastNotifications,
        fastRate: fastRate + '%',
        averageResponseTime: stats.averageResponseTime.toFixed(0) + 'ms',
        lastNotificationTime: stats.lastNotificationTime + 'ms',
        lastProcessedBlock: stats.lastProcessedBlock
      },
      diagnostic: {
        lastBlockProcessed: this.diagnosticData.lastBlockProcessed,
        lastTransactionFound: this.diagnosticData.lastTransactionFound,
        lastNotificationSent: this.diagnosticData.lastNotificationSent,
        connectionAttempts: this.diagnosticData.connectionAttempts,
        errorCount: this.diagnosticData.errors.length,
        messageCount: this.diagnosticData.webSocketMessages.length
      }
    };
  }

  // 诊断API
  getDiagnosticData() {
    return {
      summary: {
        totalMessages: this.diagnosticData.webSocketMessages.length,
        totalErrors: this.diagnosticData.errors.length,
        lastActivity: this.diagnosticData.lastNotificationSent?.timestamp || '无'
      },
      recentMessages: this.diagnosticData.webSocketMessages.slice(-20),
      errors: this.diagnosticData.errors.slice(-10),
      monitoredWallets: Array.from(this.monitoredWalletsSet),
      configWallets: CONFIG.MONITORED_WALLETS
    };
  }

  // 手动检查交易
  async manuallyCheckTransaction(txHash) {
    try {
      this.logDiagnostic('MANUAL', `手动检查交易: ${txHash}`);
      
      const tx = await this.callJsonRpc('eth_getTransactionByHash', [txHash]);
      if (!tx) {
        return { success: false, error: '交易未找到' };
      }
      
      const from = tx.from ? tx.from.toLowerCase() : '';
      const to = tx.to ? tx.to.toLowerCase() : '';
      
      const fromMonitored = this.monitoredWalletsSet.has(from);
      const toMonitored = this.monitoredWalletsSet.has(to);
      
      return {
        success: true,
        transaction: {
          hash: tx.hash,
          from,
          to,
          value: this.hexToEth(tx.value),
          isTokenTx: tx.input && tx.input !== '0x' && tx.input.length > 10
        },
        monitoring: {
          fromMonitored,
          toMonitored,
          shouldNotify: fromMonitored || toMonitored
        },
        wallets: {
          fromInSet: this.monitoredWalletsSet.has(from),
          toInSet: this.monitoredWalletsSet.has(to),
          monitoredWallets: Array.from(this.monitoredWalletsSet)
        }
      };
      
    } catch (error) {
      this.logDiagnostic('ERROR', `手动检查交易失败: ${txHash}`, error.message);
      return { success: false, error: error.message };
    }
  }
}

// ==================== Express服务器 ====================
const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 3000;
const walletMonitor = new BSCWalletMonitor();

// 基础路由
app.get('/', (req, res) => {
  res.json({ 
    status: '运行中', 
    service: 'BSC钱包监控系统',
    version: '诊断版',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    monitoring: walletMonitor.isMonitoring,
    websocket: walletMonitor.websocketConnected
  });
});

app.get('/status', (req, res) => {
  const status = walletMonitor.getSystemStatus();
  res.json(status);
});

// 诊断路由
app.get('/api/diagnostic', (req, res) => {
  const diagnostic = walletMonitor.getDiagnosticData();
  res.json(diagnostic);
});

app.get('/api/diagnostic/check-transaction/:txHash', async (req, res) => {
  const result = await walletMonitor.manuallyCheckTransaction(req.params.txHash);
  res.json(result);
});

app.get('/api/diagnostic/check-wallet/:address', (req, res) => {
  const address = req.params.address.toLowerCase();
  const isMonitored = walletMonitor.monitoredWalletsSet.has(address);
  
  res.json({
    address: req.params.address,
    normalized: address,
    isMonitored,
    inConfig: CONFIG.MONITORED_WALLETS.includes(address),
    allMonitoredWallets: Array.from(walletMonitor.monitoredWalletsSet),
    configWallets: CONFIG.MONITORED_WALLETS
  });
});

// 钱包API
app.get('/api/wallets', (req, res) => {
  res.json({
    success: true,
    data: walletMonitor.getMonitoredWallets(),
    count: walletMonitor.getMonitoredWallets().length,
    inMemory: Array.from(walletMonitor.monitoredWalletsSet),
    inConfig: CONFIG.MONITORED_WALLETS
  });
});

app.post('/api/wallets', (req, res) => {
  const { walletAddress } = req.body;
  if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    return res.status(400).json({ success: false, message: '无效地址' });
  }
  const added = walletMonitor.addWallet(walletAddress);
  if (added) {
    res.json({ 
      success: true, 
      message: '添加成功', 
      data: walletMonitor.getMonitoredWallets(),
      inMemory: Array.from(walletMonitor.monitoredWalletsSet)
    });
  } else {
    res.status(409).json({ success: false, message: '已存在' });
  }
});

app.delete('/api/wallets/:address', (req, res) => {
  const removed = walletMonitor.removeWallet(req.params.address);
  if (removed) {
    res.json({ 
      success: true, 
      message: '移除成功', 
      data: walletMonitor.getMonitoredWallets(),
      inMemory: Array.from(walletMonitor.monitoredWalletsSet)
    });
  } else {
    res.status(404).json({ success: false, message: '未找到' });
  }
});

// 管理界面
app.get('/admin', (req, res) => {
  const status = walletMonitor.getSystemStatus();
  const wallets = walletMonitor.getMonitoredWallets();
  
  res.send(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>BSC钱包监控 - 诊断版</title>
    <style>
        body { font-family: Arial; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1000px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; }
        .status { background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 10px 0; }
        .diagnostic { background: #e3f2fd; padding: 15px; border-radius: 8px; margin: 10px 0; }
        .wallet-item { background: #f9f9f9; padding: 10px; margin: 5px 0; border-radius: 4px; }
        .tab { margin-top: 20px; }
        .tab-button { padding: 10px 20px; margin-right: 10px; border: none; background: #ddd; cursor: pointer; }
        .tab-button.active { background: #4CAF50; color: white; }
        .tab-content { display: none; padding: 20px; border: 1px solid #ddd; margin-top: 10px; }
        .tab-content.active { display: block; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🛡️ BSC钱包监控系统 - 诊断版</h1>
        
        <div class="status">
            <h3>系统状态</h3>
            <p>监控状态: ${status.isMonitoring ? '✅ 运行中' : '❌ 停止'}</p>
            <p>WebSocket: ${status.websocketConnected ? '✅ 已连接' : '❌ 断开'}</p>
            <p>监控钱包: ${status.monitoredWallets}个</p>
            <p>处理区块: ${status.performance.totalBlocks}</p>
            <p>发现交易: ${status.performance.totalTransactions}</p>
            <p>发送通知: ${status.performance.totalNotifications}</p>
        </div>

        <div class="diagnostic">
            <h3>诊断信息</h3>
            <p>最后处理区块: ${status.diagnostic.lastBlockProcessed ? `#${status.diagnostic.lastBlockProcessed.blockNumber} (${status.diagnostic.lastBlockProcessed.transactionCount}笔交易)` : '无'}</p>
            <p>最后发现交易: ${status.diagnostic.lastTransactionFound ? status.diagnostic.lastTransactionFound.hash.substring(0, 16) + '...' : '无'}</p>
            <p>最后发送通知: ${status.diagnostic.lastNotificationSent ? status.diagnostic.lastNotificationSent.timestamp : '无'}</p>
            <p>连接尝试: ${status.diagnostic.connectionAttempts}次</p>
        </div>
        
        <div class="tab">
            <button class="tab-button active" onclick="showTab('wallets')">钱包管理</button>
            <button class="tab-button" onclick="showTab('diagnostic')">诊断工具</button>
            <button class="tab-button" onclick="showTab('manual')">手动检查</button>
            
            <div id="wallets" class="tab-content active">
                <h3>监控的钱包</h3>
                ${wallets.map(wallet => `
                    <div class="wallet-item">
                        <code>${wallet}</code>
                        <button onclick="removeWallet('${wallet}')" style="background: #f44336; color: white; border: none; padding: 5px 10px; border-radius: 4px; margin-left: 10px;">删除</button>
                    </div>
                `).join('')}
                
                <div style="margin-top: 20px;">
                    <h3>添加钱包</h3>
                    <input type="text" id="walletAddress" placeholder="0x..." style="padding: 8px; width: 300px; margin-right: 10px;">
                    <button onclick="addWallet()" style="background: #4CAF50; color: white; border: none; padding: 8px 16px; border-radius: 4px;">添加</button>
                </div>
            </div>
            
            <div id="diagnostic" class="tab-content">
                <h3>详细诊断</h3>
                <button onclick="loadDiagnostic()" style="background: #2196F3; color: white; border: none; padding: 10px 20px; border-radius: 4px; margin-bottom: 10px;">加载诊断数据</button>
                <div id="diagnosticResult" style="background: #f5f5f5; padding: 10px; border-radius: 4px; max-height: 400px; overflow-y: auto;"></div>
            </div>
            
            <div id="manual" class="tab-content">
                <h3>手动交易检查</h3>
                <input type="text" id="txHash" placeholder="输入交易哈希" style="padding: 8px; width: 400px; margin-right: 10px;">
                <button onclick="checkTransaction()" style="background: #FF9800; color: white; border: none; padding: 8px 16px; border-radius: 4px;">检查交易</button>
                <div id="transactionResult" style="margin-top: 10px;"></div>
            </div>
        </div>
    </div>

    <script>
        function showTab(tabName) {
            document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            document.getElementById(tabName).classList.add('active');
            event.target.classList.add('active');
        }
        
        async function addWallet() {
            const address = document.getElementById('walletAddress').value.trim();
            if (!address) return alert('请输入地址');
            
            const response = await fetch('/api/wallets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ walletAddress: address })
            });
            
            const result = await response.json();
            alert(result.success ? '添加成功' : result.message);
            if (result.success) location.reload();
        }
        
        async function removeWallet(address) {
            if (!confirm('确定删除?')) return;
            
            const response = await fetch('/api/wallets/' + address, { method: 'DELETE' });
            const result = await response.json();
            alert(result.success ? '删除成功' : result.message);
            if (result.success) location.reload();
        }
        
        async function loadDiagnostic() {
            const response = await fetch('/api/diagnostic');
            const data = await response.json();
            document.getElementById('diagnosticResult').innerHTML = '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
        }
        
        async function checkTransaction() {
            const txHash = document.getElementById('txHash').value.trim();
            if (!txHash) return alert('请输入交易哈希');
            
            const response = await fetch('/api/diagnostic/check-transaction/' + txHash);
            const result = await response.json();
            document.getElementById('transactionResult').innerHTML = '<pre>' + JSON.stringify(result, null, 2) + '</pre>';
        }
        
        // 自动刷新状态
        setInterval(() => {
            fetch('/status').then(r => r.json()).then(status => {
                if (!status.isMonitoring) {
                    location.reload();
                }
            });
        }, 10000);
    </script>
</body>
</html>
  `);
});

// 启动服务器
app.listen(PORT, () => {
  console.log('🔍 BSC钱包监控系统 - 诊断版 启动成功!');
  console.log(`📍 服务地址: http://localhost:${PORT}`);
  console.log(`🔧 管理界面: http://localhost:${PORT}/admin`);
  console.log(`📊 诊断接口: http://localhost:${PORT}/api/diagnostic`);
  console.log('🎯 诊断功能已启用，请通过管理界面进行详细诊断');
  
  setTimeout(() => {
    walletMonitor.startMonitoring().catch(console.error);
  }, 2000);
});

process.on('SIGINT', () => {
  console.log('\n👋 退出诊断模式...');
  process.exit(0);
});
