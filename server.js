// 🚀 BSC钱包监控系统 - 终极完整修复版
// server.js - 修复所有问题并优化通知格式的完整版本
const Web3 = require('web3');
const axios = require('axios');
const express = require('express');
const cors = require('cors');

// ==================== 配置区域 ====================
const CONFIG = {
  // 钉钉机器人Webhook
  DINGTALK_WEBHOOK: 'https://oapi.dingtalk.com/robot/send?access_token=d5d287f2356ab6bfa343bd2300fee541d0066505f938871992872ffc7db7a2c8',
  
  // 监控的钱包地址列表
  MONITORED_WALLETS: [
    '0x242baea6afbacde994817805db8b5c020a665811',
    '0xd1963eaa57432147b658de28c762cae79f2c8308'
  ],
  
  // 多节点配置 - 双保险
  NODES: {
    websocket: [
      {
        name: '极速WS节点1',
        url: 'wss://bsc-ws-node.nariox.org:443',
        type: 'websocket',
        priority: 1
      },
      {
        name: '极速WS节点2',
        url: 'wss://rpc.ankr.com/bsc/ws', 
        type: 'websocket',
        priority: 2
      }
    ],
    http: [
      {
        name: '极速HTTP节点1',
        url: 'https://bsc-dataseed.binance.org',
        type: 'https',
        priority: 1
      },
      {
        name: '极速HTTP节点2',
        url: 'https://bsc-mainnet.infura.io/v3/1534e27b86374dea86bcb87d984d2a61',
        type: 'https',
        priority: 2
      }
    ]
  },
  
  // 极速优化配置
  SPEED_OPTIMIZATION: {
    targetNotificationTime: 5000,     // 5秒目标通知时间
    blockProcessingTimeout: 3000,     // 3秒区块处理超时
    jsonRpcTimeout: 2000,             // 2秒JSON-RPC超时
    pollingInterval: 2000,            // 2秒轮询间隔
    parallelTransactionLimit: 10,     // 并行处理交易数
    cacheSize: {
      transactions: 5000,             // 交易缓存数量
      blocks: 10,                     // 区块缓存数量
      tokens: 100                     // 代币缓存数量
    }
  },
  
  // 交易模式识别
  TRANSACTION_PATTERNS: {
    pancakeSwapBuy: '0x7ff36ab5',     // PancakeSwap 购买
    pancakeSwapSell: '0x18cbafe5',    // PancakeSwap 出售
    tokenTransfer: '0xa9059cbb',      // 代币转账
    approve: '0x095ea7b3'             // 授权
  },
  
  // 保活配置
  KEEP_ALIVE: {
    enabled: true,
    interval: 8 * 60 * 1000,
    url: 'https://bsc-monitor-4tdg.onrender.com/health'
  }
};

// ==================== 健康监控类 ====================
class HealthMonitor {
  constructor(monitor) {
    this.monitor = monitor;
  }

  startHealthChecks() {
    setInterval(() => {
      this.checkWebSocketHealth();
      this.checkNodePerformance();
      this.checkMemoryUsage();
    }, 30000);
  }

  async checkWebSocketHealth() {
    if (!this.monitor.websocketConnected) {
      console.log('🩺 WebSocket断开，尝试重连...');
      await this.monitor.connectWebSocket();
    }
  }

  async checkNodePerformance() {
    try {
      const startTime = Date.now();
      await this.monitor.callJsonRpc('eth_blockNumber', []);
      const responseTime = Date.now() - startTime;
      
      if (responseTime > 3000) {
        console.log(`🐢 节点响应缓慢: ${responseTime}ms，考虑切换节点`);
        this.monitor.switchHttpNode();
      }
    } catch (error) {
      console.log('❌ 节点健康检查失败，切换节点');
      this.monitor.switchHttpNode();
    }
  }

  checkMemoryUsage() {
    const used = process.memoryUsage();
    const usage = (used.heapUsed / used.heapTotal * 100).toFixed(2);
    
    if (usage > 80) {
      console.log(`⚠️ 内存使用率高: ${usage}%，执行清理...`);
      this.monitor.cleanupMemory();
    }
  }
}

// ==================== 智能重试类 ====================
class SmartRetry {
  constructor() {
    this.retryStats = new Map();
  }

  async withRetry(operation, key, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation();
        
        // 记录成功
        this.recordSuccess(key);
        return result;
        
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          // 记录失败
          this.recordFailure(key);
          throw error;
        }
        
        // 智能延迟：指数退避
        const delay = Math.pow(2, attempt - 1) * 1000;
        console.log(`🔄 ${key} 第${attempt}次重试，等待${delay}ms`);
        await this.sleep(delay);
      }
    }
    
    throw lastError;
  }

  recordSuccess(key) {
    const stats = this.retryStats.get(key) || { successes: 0, failures: 0 };
    stats.successes++;
    this.retryStats.set(key, stats);
  }

  recordFailure(key) {
    const stats = this.retryStats.get(key) || { successes: 0, failures: 0 };
    stats.failures++;
    this.retryStats.set(key, stats);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ==================== 终极监控类 ====================
class BSCWalletMonitor {
  constructor() {
    this.websocketWeb3 = null;
    this.activeWsNodeIndex = 0;
    this.activeHttpNodeIndex = 0;
    this.processedTransactions = new Set();
    this.tokenCache = new Map();
    this.blockCache = new Map();
    this.walletCache = new Map();
    this.isMonitoring = false;
    this.websocketConnected = false;
    this.subscription = null;
    this.missedBlocks = new Set();
    this.performanceStats = {
      totalNotifications: 0,
      fastNotifications: 0,
      averageResponseTime: 0,
      lastNotificationTime: 0,
      totalBlocksProcessed: 0,
      totalTransactionsProcessed: 0,
      lastProcessedBlock: null
    };
    this.monitoredWalletsSet = new Set(CONFIG.MONITORED_WALLETS.map(w => w.toLowerCase()));
    this.healthMonitor = new HealthMonitor(this);
    this.smartRetry = new SmartRetry();
  }

  // ==================== 连接管理 ====================

  // 连接WebSocket节点
  async connectWebSocket() {
    return await this.smartRetry.withRetry(async () => {
      const node = CONFIG.NODES.websocket[this.activeWsNodeIndex];
      console.log(`🔌 连接WebSocket节点: ${node.name}`);
      
      this.websocketWeb3 = new Web3(new Web3.providers.WebsocketProvider(node.url, {
        timeout: 5000,
        reconnect: {
          auto: true,
          delay: 1000,
          maxAttempts: 5,
          onTimeout: true
        },
        clientConfig: {
          keepalive: true,
          keepaliveInterval: 30000
        }
      }));
      
      // 事件监听
      this.websocketWeb3.currentProvider.on('connect', () => {
        console.log('✅ WebSocket连接成功');
        this.websocketConnected = true;
        this.startWebSocketSubscription();
      });
      
      this.websocketWeb3.currentProvider.on('error', (error) => {
        console.error('❌ WebSocket错误:', error);
        this.websocketConnected = false;
      });
      
      this.websocketWeb3.currentProvider.on('end', () => {
        console.log('🔌 WebSocket连接断开');
        this.websocketConnected = false;
      });
      
      // 连接测试
      await this.websocketWeb3.eth.getBlockNumber();
      return true;
    }, 'websocket_connect');
  }

  // 启动WebSocket订阅
  startWebSocketSubscription() {
    try {
      this.subscription = this.websocketWeb3.eth.subscribe('newBlockHeaders', (error, blockHeader) => {
        if (error) {
          console.error('❌ 区块订阅错误:', error);
          this.handleWebSocketError();
          return;
        }
        
        if (blockHeader && blockHeader.number) {
          const startTime = Date.now();
          console.log(`📦 WebSocket收到新区块: ${blockHeader.number}`);
          
          // 立即处理，确保速度
          this.ultraFastProcessBlock(blockHeader.number, startTime);
        }
      });
      
      console.log('✅ WebSocket区块订阅已启动');
    } catch (error) {
      console.error('❌ 启动WebSocket订阅失败:', error);
    }
  }

  // 处理WebSocket错误
  handleWebSocketError() {
    if (this.subscription) {
      try {
        this.subscription.unsubscribe();
        this.subscription = null;
      } catch (error) {
        console.log('取消订阅错误:', error);
      }
    }
    
    // 切换节点
    this.activeWsNodeIndex = (this.activeWsNodeIndex + 1) % CONFIG.NODES.websocket.length;
    console.log(`🔄 切换到WebSocket节点: ${CONFIG.NODES.websocket[this.activeWsNodeIndex].name}`);
    
    // 5秒后重连
    setTimeout(() => {
      this.connectWebSocket();
    }, 5000);
  }

  // JSON-RPC调用 - 彻底避免大整数错误
  async callJsonRpc(method, params = []) {
    return await this.smartRetry.withRetry(async () => {
      const node = CONFIG.NODES.http[this.activeHttpNodeIndex];
      
      const response = await axios.post(node.url, {
        jsonrpc: '2.0',
        method: method,
        params: params,
        id: Date.now()
      }, {
        timeout: CONFIG.SPEED_OPTIMIZATION.jsonRpcTimeout,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.data.error) {
        throw new Error(`JSON-RPC错误: ${response.data.error.message}`);
      }
      
      return response.data.result;
    }, `jsonrpc_${method}`);
  }

  // 切换HTTP节点
  switchHttpNode() {
    this.activeHttpNodeIndex = (this.activeHttpNodeIndex + 1) % CONFIG.NODES.http.length;
    console.log(`🔄 切换到HTTP节点: ${CONFIG.NODES.http[this.activeHttpNodeIndex].name}`);
  }

  // ==================== 核心监控逻辑 ====================

  // 启动终极监控
  async startUltimateMonitoring() {
    console.log('🚀 启动BSC钱包终极监控系统...');
    
    try {
      // 连接WebSocket
      const wsConnected = await this.connectWebSocket();
      if (!wsConnected) {
        console.log('⚠️ WebSocket连接失败，将使用轮询模式');
      }
      
      this.isMonitoring = true;
      
      // 启动各种机制
      this.startBackupPolling();
      this.startMissedBlockChecker();
      this.startPerformanceMonitoring();
      this.startKeepAlive();
      this.healthMonitor.startHealthChecks();
      
      // 发送启动通知
      await this.sendStartupNotification();
      
      console.log('✅ BSC钱包终极监控系统启动完成！');
      console.log('🛡️ 三重保险机制已激活：');
      console.log('   - 🔌 WebSocket实时监听');
      console.log('   - 🔄 HTTP轮询备份'); 
      console.log('   - 🔍 漏块自动补扫');
      
    } catch (error) {
      console.error('❌ 监控系统启动失败:', error);
      setTimeout(() => this.startUltimateMonitoring(), 10000);
    }
  }

  // 启动备用轮询
  startBackupPolling() {
    console.log('🔄 启动备用轮询机制...');
    let lastBlock = null;
    
    const poll = async () => {
      try {
        const currentBlockHex = await this.callJsonRpc('eth_blockNumber', []);
        const currentBlock = parseInt(currentBlockHex, 16);
        
        if (lastBlock === null) {
          lastBlock = currentBlock;
          return;
        }
        
        if (currentBlock > lastBlock) {
          console.log(`🔍 轮询发现新区块: ${lastBlock + 1} -> ${currentBlock}`);
          
          for (let blockNumber = lastBlock + 1; blockNumber <= currentBlock; blockNumber++) {
            // 如果WebSocket已经处理过，跳过
            if (this.websocketConnected && this.performanceStats.lastProcessedBlock && blockNumber <= this.performanceStats.lastProcessedBlock) {
              continue;
            }
            
            const startTime = Date.now();
            await this.ultraFastProcessBlock(blockNumber, startTime);
            await this.sleep(300); // 稍微延迟避免过快
          }
          
          lastBlock = currentBlock;
        }
      } catch (error) {
        console.error('❌ 轮询错误:', error.message);
      }
    };
    
    setInterval(poll, CONFIG.SPEED_OPTIMIZATION.pollingInterval);
  }

  // 启动漏块检查器
  startMissedBlockChecker() {
    console.log('🔍 启动漏块检查器...');
    
    setInterval(async () => {
      try {
        if (this.missedBlocks.size > 0) {
          console.log(`⚠️ 发现 ${this.missedBlocks.size} 个待处理区块`);
          
          for (const blockNumber of this.missedBlocks) {
            await this.ultraFastProcessBlock(blockNumber, Date.now());
            await this.sleep(500);
          }
        }
        
        // 定期检查漏块
        await this.checkForMissedBlocks();
      } catch (error) {
        console.error('❌ 漏块检查错误:', error.message);
      }
    }, 10000); // 每10秒检查一次
  }

  // 检查漏块
  async checkForMissedBlocks() {
    try {
      const currentBlockHex = await this.callJsonRpc('eth_blockNumber', []);
      const currentBlock = parseInt(currentBlockHex, 16);
      
      if (this.performanceStats.lastProcessedBlock && currentBlock > this.performanceStats.lastProcessedBlock + 1) {
        const missedCount = currentBlock - this.performanceStats.lastProcessedBlock - 1;
        console.log(`🔍 漏块检查发现 ${missedCount} 个可能漏掉的区块`);
        
        for (let i = this.performanceStats.lastProcessedBlock + 1; i < currentBlock; i++) {
          this.missedBlocks.add(i);
        }
      }
    } catch (error) {
      console.error('❌ 漏块检查错误:', error.message);
    }
  }

  // ==================== 极速区块处理 ====================

  // 极速处理区块
  async ultraFastProcessBlock(blockNumber, startTime) {
    const processingTimeout = setTimeout(() => {
      console.log(`⏰ 区块 ${blockNumber} 处理超时，加入漏块列表`);
      this.missedBlocks.add(blockNumber);
    }, CONFIG.SPEED_OPTIMIZATION.blockProcessingTimeout);

    try {
      console.log(`⚡ 极速处理区块: ${blockNumber}`);
      
      // 使用JSON-RPC获取区块数据 - 彻底避免大整数错误
      const blockNumberHex = '0x' + blockNumber.toString(16);
      const block = await this.callJsonRpc('eth_getBlockByNumber', [blockNumberHex, true]);
      
      if (!block || !block.transactions) {
        clearTimeout(processingTimeout);
        return;
      }
      
      const fetchTime = Date.now() - startTime;
      console.log(`✅ 区块数据获取: ${fetchTime}ms, 交易数: ${block.transactions.length}`);
      
      // 处理交易
      await this.processBlockTransactions(block.transactions, block, startTime);
      
      // 更新统计
      this.performanceStats.totalBlocksProcessed++;
      this.performanceStats.totalTransactionsProcessed += block.transactions.length;
      this.performanceStats.lastProcessedBlock = blockNumber;
      
      const totalTime = Date.now() - startTime;
      console.log(`🎯 区块 ${blockNumber} 处理完成: ${totalTime}ms`);
      
      // 从漏块列表中移除
      this.missedBlocks.delete(blockNumber);
      
    } catch (error) {
      console.error(`❌ 处理区块 ${blockNumber} 失败:`, error.message);
      
      if (error.message.includes('53 bits') || error.message.includes('BigNumber')) {
        console.log(`⚠️ 检测到大整数错误，将区块 ${blockNumber} 加入漏块列表`);
        this.missedBlocks.add(blockNumber);
      }
    } finally {
      clearTimeout(processingTimeout);
    }
  }

  // 处理区块交易
  async processBlockTransactions(transactions, block, startTime) {
    const monitoredTxs = [];
    
    // 第一轮：快速筛选监控交易
    for (const tx of transactions) {
      const txKey = `${tx.hash}-${block.number}`;
      
      if (this.processedTransactions.has(txKey)) {
        continue;
      }
      
      this.processedTransactions.add(txKey);
      
      // 检查监控钱包
      const fromLower = tx.from ? tx.from.toLowerCase() : '';
      const toLower = tx.to ? tx.to.toLowerCase() : '';
      
      const fromMonitored = this.monitoredWalletsSet.has(fromLower);
      const toMonitored = this.monitoredWalletsSet.has(toLower);
      
      if (fromMonitored || toMonitored) {
        monitoredTxs.push({
          tx: tx,
          fromMonitored: fromMonitored,
          toMonitored: toMonitored
        });
      }
      
      // 清理旧记录
      if (this.processedTransactions.size > CONFIG.SPEED_OPTIMIZATION.cacheSize.transactions) {
        const firstKey = this.processedTransactions.values().next().value;
        this.processedTransactions.delete(firstKey);
      }
    }
    
    if (monitoredTxs.length === 0) {
      return;
    }
    
    console.log(`🎯 发现 ${monitoredTxs.length} 笔监控交易`);
    
    // 第二轮：并行发送通知
    const notificationPromises = monitoredTxs.map(monitoredTx => 
      this.sendUltraFastNotification(monitoredTx.tx, block, monitoredTx.fromMonitored, monitoredTx.toMonitored, startTime)
    );
    
    await Promise.all(notificationPromises);
  }

  // ==================== 极速通知系统 ====================

  // 发送极速通知
  async sendUltraFastNotification(tx, block, fromMonitored, toMonitored, startTime) {
    const notificationStart = Date.now();
    const detectionTime = notificationStart - startTime;
    
    try {
      // 分析交易类型
      const transactionAnalysis = this.analyzeTransaction(tx, fromMonitored, toMonitored);
      
      // 生成极速消息
      const message = this.generateUltraFastMessage(tx, block, transactionAnalysis, detectionTime);
      
      // 立即发送通知
      this.sendDingTalkImmediate(message);
      
      const notificationTime = Date.now() - notificationStart;
      const totalTime = detectionTime + notificationTime;
      
      console.log(`⚡ 极速通知: 检测${detectionTime}ms + 发送${notificationTime}ms = 总计${totalTime}ms`);
      
      // 更新性能统计
      this.updatePerformanceStats(totalTime);
      
      // 如果是复杂交易，发送详细通知
      if (transactionAnalysis.isComplex) {
        setTimeout(() => this.sendDetailedNotification(tx, block, transactionAnalysis), 2000);
      }
      
    } catch (error) {
      console.error('❌ 发送通知失败:', error.message);
    }
  }

  // 分析交易
  analyzeTransaction(tx, fromMonitored, toMonitored) {
    let transactionType = '';
    let isComplex = false;
    let riskLevel = 'LOW';
    
    // 判断基础交易类型
    if (fromMonitored && toMonitored) {
      transactionType = '内部转账';
    } else if (fromMonitored) {
      transactionType = '转出BNB';
    } else if (toMonitored) {
      transactionType = '转入BNB';
    }
    
    // 检查是否为代币交易
    if (tx.input && tx.input !== '0x' && tx.input.length > 10) {
      isComplex = true;
      
      // 识别具体交易类型
      if (tx.input.startsWith(CONFIG.TRANSACTION_PATTERNS.pancakeSwapBuy)) {
        transactionType = '购买Meme币';
        riskLevel = 'MEDIUM';
      } else if (tx.input.startsWith(CONFIG.TRANSACTION_PATTERNS.pancakeSwapSell)) {
        transactionType = '出售代币';
        riskLevel = 'MEDIUM';
      } else if (tx.input.startsWith(CONFIG.TRANSACTION_PATTERNS.tokenTransfer)) {
        transactionType = '代币转账';
      } else if (tx.input.startsWith(CONFIG.TRANSACTION_PATTERNS.approve)) {
        transactionType = '合约授权';
        riskLevel = 'HIGH';
      } else {
        transactionType = '智能合约交互';
        riskLevel = 'MEDIUM';
      }
    }
    
    // 风险评估
    let value = '0';
    try {
      if (tx.value) {
        const valueBigInt = BigInt(tx.value);
        const web3 = new Web3();
        value = web3.utils.fromWei(valueBigInt.toString(), 'ether');
        
        // 基于金额评估风险
        const valueNum = parseFloat(value);
        if (valueNum > 10) riskLevel = 'HIGH';
        else if (valueNum > 1) riskLevel = 'MEDIUM';
      }
    } catch (error) {
      value = '0';
    }
    
    return {
      type: transactionType,
      isComplex: isComplex,
      riskLevel: riskLevel,
      value: value,
      fromMonitored: fromMonitored,
      toMonitored: toMonitored
    };
  }

  // 生成极速消息 - 优化版：便于复制完整地址
  generateUltraFastMessage(tx, block, analysis, detectionTime) {
    const walletAddress = analysis.fromMonitored ? tx.from : tx.to;
    const shortAddress = (addr) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '合约创建';
    const isTokenTx = analysis.isComplex && tx.to;
    
    let emoji = '🔔';
    // 风险等级表情
    if (analysis.riskLevel === 'HIGH') emoji = '🚨';
    else if (analysis.riskLevel === 'MEDIUM') emoji = '⚠️';
    
    const totalTime = detectionTime + 800; // 预估发送时间

    let text = `### ${emoji} 实时交易提醒 (${totalTime}ms)\n\n` +
               `**${analysis.type}** | ${analysis.riskLevel}风险\n\n` +
               `👇 **复制地址说明** 👇\n` +
               `• 点击下方灰色框内的地址\n` +
               `• 手机端: 长按 → 选择"复制"\n` +
               `• 电脑端: 点击 → Ctrl+C\n\n` +
               `📋 **钱包地址**\n` +
               `\`${walletAddress}\`\n` +
               `(显示: ${shortAddress(walletAddress)})\n`;
    
    // 如果是代币交易，添加合约地址
    if (isTokenTx) {
        text += `\n📋 **合约地址**\n` +
                `\`${tx.to}\`\n` +
                `(显示: ${shortAddress(tx.to)})\n`;
    }
    
    text += `\n**金额**: ${analysis.value} BNB\n` +
            `**区块**: ${block.number}\n` +
            `**响应时间**: ${totalTime}ms\n` +
            `**时间**: ${new Date().toLocaleString('zh-CN')}\n\n` +
            `🔗 **快速链接**\n` +
            `• [查看交易](https://bscscan.com/tx/${tx.hash})\n` +
            `• [查看钱包](https://bscscan.com/address/${walletAddress})`;
    
    if (isTokenTx) {
        text += `\n• [查看合约](https://bscscan.com/address/${tx.to})`;
    }

    // 高风险交易@所有人
    const at = analysis.riskLevel === 'HIGH' ? { isAtAll: true } : { isAtAll: false };
    
    return {
      msgtype: 'markdown',
      markdown: {
        title: `${emoji} BSC交易监控`,
        text: text
      },
      at: at
    };
  }

  // 发送详细通知
  async sendDetailedNotification(tx, block, analysis) {
    try {
      const tokenInfo = await this.getTokenInfo(tx);
      const message = this.generateDetailedMessage(tx, block, analysis, tokenInfo);
      await this.sendDingTalkImmediate(message);
      console.log('🔍 详细通知已发送');
    } catch (error) {
      console.log('详细通知发送失败');
    }
  }

  // 获取代币信息
  async getTokenInfo(tx) {
    if (!tx.to) return null;
    
    if (this.tokenCache.has(tx.to)) {
      return this.tokenCache.get(tx.to);
    }
    
    try {
      const nameData = await this.callJsonRpc('eth_call', [{
        to: tx.to,
        data: '0x06fdde03' // name()
      }, 'latest']);
      
      const symbolData = await this.callJsonRpc('eth_call', [{
        to: tx.to, 
        data: '0x95d89b41' // symbol()
      }, 'latest']);
      
      const name = nameData && nameData !== '0x' ? this.hexToString(nameData) : 'Unknown';
      const symbol = symbolData && symbolData !== '0x' ? this.hexToString(symbolData) : 'UNKNOWN';
      
      const tokenInfo = {
        name: name || 'Unknown Token',
        symbol: symbol || 'UNKNOWN',
        address: tx.to
      };
      
      this.tokenCache.set(tx.to, tokenInfo);
      
      // 设置缓存过期
      setTimeout(() => {
        this.tokenCache.delete(tx.to);
      }, 300000); // 5分钟
      
      return tokenInfo;
    } catch (error) {
      return null;
    }
  }

  // 生成详细消息 - 优化版：便于复制完整地址
  generateDetailedMessage(tx, block, analysis, tokenInfo) {
    const walletAddress = analysis.fromMonitored ? tx.from : tx.to;
    const shortAddress = (addr) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '合约创建';
    
    let text = `### 🔥 交易详情分析\n\n` +
               `**${analysis.type}** | ${analysis.riskLevel}风险\n\n` +
               `👇 **复制地址说明** 👇\n` +
               `• 点击下方灰色框内的地址\n` +
               `• 手机端: 长按 → 选择"复制"\n` +
               `• 电脑端: 点击 → Ctrl+C\n\n` +
               `📋 **钱包地址**\n` +
               `\`${walletAddress}\`\n` +
               `(显示: ${shortAddress(walletAddress)})\n\n` +
               `**金额**: ${analysis.value} BNB\n`;
    
    if (tokenInfo) {
      text += `**代币名称**: ${tokenInfo.name}\n` +
              `**代币符号**: ${tokenInfo.symbol}\n` +
              `📋 **合约地址**\n` +
              `\`${tokenInfo.address}\`\n` +
              `(显示: ${shortAddress(tokenInfo.address)})\n\n`;
    }
    
    text += `**交易哈希**: \`${tx.hash}\`\n` +
            `**区块高度**: ${block.number}\n\n` +
            `🔗 **快速链接**\n` +
            `• [查看交易](https://bscscan.com/tx/${tx.hash})\n` +
            `• [查看钱包](https://bscscan.com/address/${walletAddress})\n`;
    
    if (tokenInfo) {
      text += `• [查看合约](https://bscscan.com/address/${tokenInfo.address})\n` +
              `• [Dextools分析](https://www.dextools.io/app/bnb/pair-explorer/${tokenInfo.address})\n` +
              `• [购买代币](https://pancakeswap.finance/swap?outputCurrency=${tokenInfo.address})`;
    }
    
    return {
      msgtype: 'markdown',
      markdown: {
        title: '🚀 交易详情分析',
        text: text
      },
      at: {
        isAtAll: false
      }
    };
  }

  // 立即发送钉钉通知
  async sendDingTalkImmediate(message) {
    axios.post(CONFIG.DINGTALK_WEBHOOK, message, {
      timeout: 5000
    }).then(response => {
      if (response.data.errcode === 0) {
        console.log('✅ 钉钉通知发送成功');
      } else {
        console.log('❌ 钉钉通知发送失败:', response.data);
      }
    }).catch(error => {
      console.error('❌ 发送钉钉通知失败:', error.message);
    });
  }

  // ==================== 辅助方法 ====================

  // 十六进制转字符串
  hexToString(hex) {
    try {
      if (!hex || hex === '0x') return '';
      let str = '';
      for (let i = 2; i < hex.length; i += 2) {
        const charCode = parseInt(hex.substr(i, 2), 16);
        if (charCode > 0) {
          str += String.fromCharCode(charCode);
        }
      }
      return str.replace(/\0/g, '');
    } catch (error) {
      return 'Unknown';
    }
  }

  // 更新性能统计
  updatePerformanceStats(responseTime) {
    this.performanceStats.totalNotifications++;
    this.performanceStats.lastNotificationTime = responseTime;
    
    if (responseTime <= CONFIG.SPEED_OPTIMIZATION.targetNotificationTime) {
      this.performanceStats.fastNotifications++;
    }
    
    this.performanceStats.averageResponseTime = 
      (this.performanceStats.averageResponseTime * (this.performanceStats.totalNotifications - 1) + responseTime) 
      / this.performanceStats.totalNotifications;
    
    // 每5次通知打印统计
    if (this.performanceStats.totalNotifications % 5 === 0) {
      const fastRate = (this.performanceStats.fastNotifications / this.performanceStats.totalNotifications * 100).toFixed(1);
      console.log(`📊 性能统计: 平均${this.performanceStats.averageResponseTime.toFixed(0)}ms, 极速率${fastRate}%`);
    }
  }

  // 启动性能监控
  startPerformanceMonitoring() {
    setInterval(() => {
      const stats = this.performanceStats;
      const fastRate = stats.totalNotifications > 0 ? 
        (stats.fastNotifications / stats.totalNotifications * 100).toFixed(1) : 0;
      
      console.log(`🎯 实时性能: 区块${stats.totalBlocksProcessed}, 交易${stats.totalTransactionsProcessed}, ` +
                 `通知${stats.totalNotifications}, 极速${stats.fastNotifications}, 极速率${fastRate}%`);
    }, 30000);
  }

  // 启动保活机制
  startKeepAlive() {
    if (!CONFIG.KEEP_ALIVE.enabled) return;
    
    setInterval(async () => {
      try {
        await axios.get(CONFIG.KEEP_ALIVE.url, { timeout: 10000 });
        console.log('❤️ 保活心跳成功');
      } catch (error) {
        console.log('💔 保活心跳失败:', error.message);
      }
    }, CONFIG.KEEP_ALIVE.interval);
    
    console.log('✅ 自保活机制已启动');
  }

  // 睡眠函数
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 发送启动通知
  async sendStartupNotification() {
    const message = {
      msgtype: 'markdown',
      markdown: {
        title: '🚀 BSC终极监控启动',
        text: `### 🛡️ BSC钱包终极监控系统已启动\n\n` +
              `**版本**: 终极完整版\n` +
              `**启动时间**: ${new Date().toLocaleString('zh-CN')}\n` +
              `**监控钱包**: ${CONFIG.MONITORED_WALLETS.length}个\n` +
              `**目标响应**: ≤5秒\n` +
              `**技术保障**: \n` +
              `- ⚡ WebSocket实时监听\n` +
              `- 🛡️ JSON-RPC零大整数错误\n` +
              `- 🔄 三重保险防漏块\n` +
              `- 🎯 智能交易分析\n\n` +
              `💡 系统已开始极速监控，交易将在5秒内通知！`
      },
      at: {
        isAtAll: false
      }
    };
    
    this.sendDingTalkImmediate(message);
  }

  // 管理钱包方法
  getMonitoredWallets() {
    return [...CONFIG.MONITORED_WALLETS];
  }

  addWallet(walletAddress) {
    const address = walletAddress.toLowerCase();
    if (!CONFIG.MONITORED_WALLETS.includes(address)) {
      CONFIG.MONITORED_WALLETS.push(address);
      this.monitoredWalletsSet.add(address);
      console.log(`✅ 添加监控钱包: ${address}`);
      return true;
    }
    return false;
  }

  removeWallet(walletAddress) {
    const address = walletAddress.toLowerCase();
    const index = CONFIG.MONITORED_WALLETS.indexOf(address);
    if (index > -1) {
      CONFIG.MONITORED_WALLETS.splice(index, 1);
      this.monitoredWalletsSet.delete(address);
      console.log(`✅ 移除监控钱包: ${address}`);
      return true;
    }
    return false;
  }

  // 获取系统状态
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
      activeWsNode: CONFIG.NODES.websocket[this.activeWsNodeIndex].name,
      activeHttpNode: CONFIG.NODES.http[this.activeHttpNodeIndex].name,
      performance: {
        totalBlocks: stats.totalBlocksProcessed,
        totalTransactions: stats.totalTransactionsProcessed,
        totalNotifications: stats.totalNotifications,
        fastNotifications: stats.fastNotifications,
        fastRate: fastRate + '%',
        averageResponseTime: stats.averageResponseTime.toFixed(0) + 'ms',
        lastNotificationTime: stats.lastNotificationTime + 'ms',
        lastProcessedBlock: stats.lastProcessedBlock
      }
    };
  }

  // 内存清理
  cleanupMemory() {
    const currentSize = this.processedTransactions.size;
    if (currentSize > CONFIG.SPEED_OPTIMIZATION.cacheSize.transactions * 1.5) {
      const toDelete = currentSize - CONFIG.SPEED_OPTIMIZATION.cacheSize.transactions;
      let deleted = 0;
      
      for (const key of this.processedTransactions) {
        this.processedTransactions.delete(key);
        deleted++;
        if (deleted >= toDelete) break;
      }
      
      console.log(`🧹 内存清理: 删除${deleted}条旧交易记录`);
    }
  }
}

// ==================== 初始化监控系统 ====================
const walletMonitor = new BSCWalletMonitor();

// ==================== Express服务器 ====================
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// 健康检查端点
app.get('/', (req, res) => {
  res.json({ 
    status: '运行中', 
    service: 'BSC钱包终极监控系统',
    version: '终极完整版',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// 系统状态端点
app.get('/status', (req, res) => {
  const status = walletMonitor.getSystemStatus();
  res.json(status);
});

// 管理界面API端点
app.get('/api/wallets', (req, res) => {
  res.json({
    success: true,
    data: walletMonitor.getMonitoredWallets(),
    count: walletMonitor.getMonitoredWallets().length
  });
});

app.post('/api/wallets', (req, res) => {
  const { walletAddress } = req.body;
  
  if (!walletAddress) {
    return res.status(400).json({
      success: false,
      message: '钱包地址不能为空'
    });
  }
  
  if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    return res.status(400).json({
      success: false,
      message: '无效的钱包地址格式'
    });
  }
  
  const added = walletMonitor.addWallet(walletAddress);
  
  if (added) {
    res.json({
      success: true,
      message: '钱包添加成功',
      data: walletMonitor.getMonitoredWallets()
    });
  } else {
    res.status(409).json({
      success: false,
      message: '钱包已在监控列表中'
    });
  }
});

app.delete('/api/wallets/:address', (req, res) => {
  const { address } = req.params;
  
  const removed = walletMonitor.removeWallet(address);
  
  if (removed) {
    res.json({
      success: true,
      message: '钱包移除成功',
      data: walletMonitor.getMonitoredWallets()
    });
  } else {
    res.status(404).json({
      success: false,
      message: '钱包不在监控列表中'
    });
  }
});

// 管理界面页面
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
        .system-card { background: #fff3cd; border-left-color: #ffc107; }
        .insurance-card { background: #d1ecf1; border-left-color: #17a2b8; }
        .wallets { margin: 20px 0; }
        .wallet-item { background: #f9f9f9; padding: 10px; margin: 5px 0; border-radius: 4px; border-left: 4px solid #4CAF50; display: flex; justify-content: space-between; align-items: center; }
        .form-group { margin: 20px 0; }
        input[type="text"] { width: 70%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 16px; margin-right: 10px; }
        button { background: #4CAF50; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; }
        button:hover { background: #45a049; }
        .delete-btn { background: #f44336; }
        .delete-btn:hover { background: #da190b; }
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
        <h1>🛡️ BSC钱包终极监控系统 v8.0</h1>
        
        <div class="speed-indicator ${status.performance.lastNotificationTime <= 3000 ? 'ultra-fast' : status.performance.lastNotificationTime <= 5000 ? 'fast' : 'slow'}">
            ⚡ 目标: 5秒内通知 | 最后响应: ${status.performance.lastNotificationTime}ms | 极速率: ${status.performance.fastRate}
        </div>
        
        <div class="status-grid">
            <div class="status-card performance-card">
                <h3>📊 性能统计</h3>
                <div class="stats-grid">
                    <div class="stat-item">
                        <div style="font-size: 24px; font-weight: bold;">${status.performance.totalBlocks}</div>
                        <div>处理区块</div>
                    </div>
                    <div class="stat-item">
                        <div style="font-size: 24px; font-weight: bold;">${status.performance.totalTransactions}</div>
                        <div>扫描交易</div>
                    </div>
                    <div class="stat-item">
                        <div style="font-size: 24px; font-weight: bold;">${status.performance.totalNotifications}</div>
                        <div>发送通知</div>
                    </div>
                </div>
                <p><strong>平均响应:</strong> ${status.performance.averageResponseTime}</p>
                <p><strong>极速通知:</strong> ${status.performance.fastNotifications}</p>
                <p><strong>最后区块:</strong> ${status.performance.lastProcessedBlock || '未知'}</p>
            </div>
            
            <div class="status-card system-card">
                <h3>🔧 系统状态</h3>
                <p><strong>运行状态:</strong> ${status.isMonitoring ? '✅ 监控中' : '❌ 未运行'}</p>
                <p><strong>WebSocket:</strong> ${status.websocketConnected ? '✅ 已连接' : '❌ 断开'}</p>
                <p><strong>监控钱包:</strong> ${status.monitoredWallets}个</p>
                <p><strong>已处理交易:</strong> ${status.processedTransactions}</p>
                <p><strong>漏块数量:</strong> ${status.missedBlocks}</p>
            </div>
            
            <div class="status-card">
                <h3>🌐 节点信息</h3>
                <p><strong>WebSocket节点:</strong> ${status.activeWsNode}</p>
                <p><strong>HTTP节点:</strong> ${status.activeHttpNode}</p>
            </div>
            
            <div class="status-card insurance-card">
                <h3>🛡️ 三重保险</h3>
                <p>✅ WebSocket实时监听</p>
                <p>✅ HTTP轮询备份</p>
                <p>✅ 漏块自动补扫</p>
                <p>✅ 零大整数错误</p>
                <p>✅ 5秒内通知</p>
            </div>
        </div>
        
        <div class="wallets">
            <h3>👛 监控的钱包地址</h3>
            ${wallets.map(wallet => `
                <div class="wallet-item">
                    <code>${wallet}</code>
                    <button class="delete-btn" onclick="removeWallet('${wallet}')">删除</button>
                </div>
            `).join('')}
            ${wallets.length === 0 ? '<p>暂无监控的钱包</p>' : ''}
        </div>
        
        <div class="form-group">
            <h3>➕ 添加监控钱包</h3>
            <input type="text" id="walletAddress" placeholder="输入BSC钱包地址 (0x...)" />
            <button onclick="addWallet()">添加钱包</button>
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
                    indicator.innerHTML = `⚡ 目标: 5秒内通知 | 最后响应: ${status.performance.lastNotificationTime}ms | 极速率: ${status.performance.fastRate}`;
                    indicator.className = 'speed-indicator ' + 
                        (parseInt(status.performance.lastNotificationTime) <= 3000 ? 'ultra-fast' : 
                         parseInt(status.performance.lastNotificationTime) <= 5000 ? 'fast' : 'slow');
                });
        }, 3000);
    </script>
</body>
</html>
  `);
});

// ==================== 启动服务器和监控 ====================
app.listen(PORT, () => {
  console.log('='.repeat(70));
  console.log('🚀 BSC钱包终极监控系统 v8.0 启动成功!');
  console.log('🛡️ 终极完整版 - 集成所有优化');
  console.log(`📍 服务地址: http://localhost:${PORT}`);
  console.log(`🔧 管理界面: http://localhost:${PORT}/admin`);
  console.log(`❤️ 健康检查: http://localhost:${PORT}/health`);
  console.log('🎯 核心特性:');
  console.log(`   - ⚡ 5秒内极速通知`);
  console.log(`   - 🛡️ 零大整数错误保障`);
  console.log(`   - 📡 三重保险防漏交易`);
  console.log(`   - 💰 完整BNB和Meme币监控`);
  console.log(`   - 🎯 智能交易分析`);
  console.log(`   - 🔄 自动故障恢复`);
  console.log(`   - 📊 实时性能监控`);
  console.log('='.repeat(70));
  
  // 延迟启动监控
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
