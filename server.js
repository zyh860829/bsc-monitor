// server.js - BSC钱包实时监控系统优化版
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
  
  // 多节点配置 - 优化版
  NODES: [
    // 第一梯队：高质量节点
    {
      name: 'Infura专属节点',
      url: 'wss://bsc-mainnet.infura.io/ws/v3/1534e27b86374dea86bcb87d984d2a61',
      type: 'websocket',
      priority: 1
    },
    // 第二梯队：可靠公共节点
    {
      name: 'Binance官方节点',
      url: 'wss://bsc-ws-node.nariox.org:443',
      type: 'websocket',
      priority: 2
    },
    {
      name: 'Ankr节点',
      url: 'wss://rpc.ankr.com/bsc/ws',
      type: 'websocket', 
      priority: 3
    }
  ],
  
  // 优化请求频率
  RATE_LIMIT: {
    requestsPerSecond: 5,
    backupPollingInterval: 10000 // 10秒备用轮询
  },
  
  // 保活配置
  KEEP_ALIVE: {
    enabled: true,
    interval: 8 * 60 * 1000, // 8分钟一次（小于10分钟休眠阈值）
    url: 'https://bsc-monitor-4tdg.onrender.com/health'
  }
};

// ==================== 核心监控类 ====================
class BSCWalletMonitor {
  constructor() {
    this.web3 = null;
    this.activeNodeIndex = 0;
    this.processedTransactions = new Set();
    this.tokenCache = new Map();
    this.requestCount = 0;
    this.lastRequestTime = Date.now();
    this.lastProcessedBlock = null;
    this.keepAliveInterval = null;
    
    this.useDatabase = false;
  }
  
  // 多节点连接管理 - 优化版
  async connectToNode() {
    const MAX_RETRIES = 2;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const node = CONFIG.NODES[this.activeNodeIndex];
        console.log(`🚀 快速连接节点: ${node.name} (尝试 ${attempt}/${MAX_RETRIES})`);
        
        if (node.type === 'websocket') {
          this.web3 = new Web3(new Web3.providers.WebsocketProvider(node.url, {
            timeout: 8000,
            reconnect: {
              auto: true,
              delay: 2000,
              maxAttempts: 8,
              onTimeout: true
            },
            clientConfig: {
              keepalive: true,
              keepaliveInterval: 15000
            }
          }));
        } else {
          this.web3 = new Web3(new Web3.providers.HttpProvider(node.url, {
            timeout: 10000
          }));
        }
        
        // 快速连接测试
        const startTime = Date.now();
        const blockNumber = await this.web3.eth.getBlockNumber();
        const connectTime = Date.now() - startTime;
        
        console.log(`✅ 节点连接成功: ${node.name}, 耗时: ${connectTime}ms, 区块: ${blockNumber}`);
        return true;
        
      } catch (error) {
        console.log(`❌ 节点连接失败: ${CONFIG.NODES[this.activeNodeIndex].name}, 错误: ${error.message}`);
        
        if (attempt === MAX_RETRIES) {
          console.log('所有重试失败，切换到下一个节点');
          this.switchToNextNode();
          return false;
        }
        
        await this.sleep(1000);
      }
    }
  }
  
  // 切换到下一个节点
  switchToNextNode() {
    this.activeNodeIndex = (this.activeNodeIndex + 1) % CONFIG.NODES.length;
    console.log(`切换到节点: ${CONFIG.NODES[this.activeNodeIndex].name}`);
  }
  
  // 请求频率控制
  async rateLimit() {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    
    if (elapsed < 1000 / CONFIG.RATE_LIMIT.requestsPerSecond) {
      await this.sleep(1000 / CONFIG.RATE_LIMIT.requestsPerSecond - elapsed);
    }
    
    this.lastRequestTime = Date.now();
    this.requestCount++;
  }
  
  // 睡眠函数
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // 启动监控
  async startMonitoring() {
    console.log('🚀 启动BSC钱包监控系统...');
    
    const connected = await this.connectToNode();
    if (!connected) {
      console.log('❌ 所有节点连接失败，将在30秒后重试');
      setTimeout(() => this.startMonitoring(), 30000);
      return;
    }
    
    // 启动保活机制
    this.startKeepAlive();
    
    // 发送启动成功通知
    await this.sendStartupNotification();
    
    // 订阅新区块
    try {
      this.web3.eth.subscribe('newBlockHeaders', (error, blockHeader) => {
        if (error) {
          console.error('❌ 区块订阅错误:', error);
          this.handleConnectionError();
          return;
        }
        
        console.log(`📦 收到新区块: ${blockHeader.number}`);
        this.processBlock(blockHeader.number);
      });
      
      console.log('✅ 区块订阅成功');
    } catch (error) {
      console.error('❌ 订阅初始化失败:', error);
      this.handleConnectionError();
    }
    
    // 启动备用轮询
    this.startBackupPolling();
    
    // 启动统计报告
    this.startStatsReporting();
    
    // 启动节点健康检查
    this.startNodeHealthCheck();
  }
  
  // 处理连接错误
  handleConnectionError() {
    console.log('处理连接错误，切换到下一个节点');
    this.switchToNextNode();
    setTimeout(() => this.startMonitoring(), 5000);
  }
  
  // 处理新区块 - 优化并行处理
  async processBlock(blockNumber) {
    try {
      await this.rateLimit();
      const block = await this.web3.eth.getBlock(blockNumber, true);
      
      if (!block || !block.transactions) {
        return;
      }
      
      console.log(`🔍 扫描区块 ${blockNumber}, 交易数量: ${block.transactions.length}`);
      
      // 并行处理交易
      const processingPromises = block.transactions.map(tx => 
        this.processTransaction(tx, block)
      );
      
      await Promise.all(processingPromises);
      this.lastProcessedBlock = blockNumber;
      
    } catch (error) {
      console.error(`处理区块 ${blockNumber} 错误:`, error.message);
    }
  }
  
  // 处理交易
  async processTransaction(tx, block) {
    const txKey = `${tx.hash}-${block.number}`;
    
    if (this.processedTransactions.has(txKey)) {
      return;
    }
    this.processedTransactions.add(txKey);
    
    // 清理旧记录
    if (this.processedTransactions.size > 10000) {
      const firstKey = this.processedTransactions.values().next().value;
      this.processedTransactions.delete(firstKey);
    }
    
    // 检查监控钱包
    const fromMonitored = CONFIG.MONITORED_WALLETS.includes(tx.from?.toLowerCase());
    const toMonitored = CONFIG.MONITORED_WALLETS.includes(tx.to?.toLowerCase());
    
    if (fromMonitored || toMonitored) {
      console.log(`🎯 发现监控钱包交易: ${tx.hash}`);
      await this.analyzeAndNotify(tx, block, fromMonitored, toMonitored);
    }
  }
  
  // 分析交易并发送通知 - 优化快速通知
  async analyzeAndNotify(tx, block, fromMonitored, toMonitored) {
    const notificationStartTime = Date.now();
    
    try {
      // 快速判断交易类型
      let transactionType = '';
      let isTokenTrade = false;
      
      if (fromMonitored && toMonitored) {
        transactionType = '内部转账';
      } else if (fromMonitored) {
        transactionType = '转出BNB';
      } else if (toMonitored) {
        transactionType = '转入BNB';
      }
      
      // 快速检测代币交易
      if (tx.input && tx.input !== '0x' && tx.input.length > 10) {
        isTokenTrade = true;
        transactionType = '代币交易';
      }
      
      // 3秒内发送首次通知
      const basicMessage = this.generateBasicDingTalkMessage(tx, block, transactionType);
      await this.sendDingTalkNotification(basicMessage);
      
      const firstNotificationTime = Date.now() - notificationStartTime;
      console.log(`⚡ 首次通知耗时: ${firstNotificationTime}ms`);
      
      // 异步获取代币详情
      if (isTokenTrade) {
        setTimeout(async () => {
          try {
            const tokenInfo = await this.getTokenInfo(tx);
            const detailedMessage = this.generateTokenDingTalkMessage(tx, block, tokenInfo);
            await this.sendDingTalkNotification(detailedMessage);
            console.log(`🔍 代币详情通知已发送`);
          } catch (error) {
            console.log('代币详情获取失败，但基础通知已发送');
          }
        }, 2000);
      }
      
    } catch (error) {
      console.error('交易分析失败:', error);
    }
  }
  
  // 基础快速通知
  generateBasicDingTalkMessage(tx, block, transactionType) {
    const shortAddress = (addr) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '合约创建';
    const amount = this.web3.utils.fromWei(tx.value || '0', 'ether');
    
    let emoji = '🔔';
    if (transactionType.includes('转入')) emoji = '💰';
    if (transactionType.includes('转出')) emoji = '📤';
    if (transactionType.includes('代币')) emoji = '🚀';
    
    return {
      msgtype: 'markdown',
      markdown: {
        title: `${emoji} BSC交易监控`,
        text: `### ${emoji} 实时交易提醒\n\n` +
              `**交易类型**: ${transactionType}\n` +
              `**监控钱包**: \`${shortAddress(tx.from || tx.to)}\`\n` +
              `**金额**: ${amount} BNB\n` +
              `**区块**: ${block.number}\n` +
              `**时间**: ${new Date().toLocaleString('zh-CN')}\n\n` +
              `🔗 [立即查看交易](https://bscscan.com/tx/${tx.hash})`
      },
      at: {
        isAtAll: false
      }
    };
  }
  
  // 代币详情通知
  generateTokenDingTalkMessage(tx, block, tokenInfo) {
    const shortAddress = (addr) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '合约创建';
    
    return {
      msgtype: 'markdown',
      markdown: {
        title: '🚀 Meme币交易详情',
        text: `### 🔥 Meme币交易详情\n\n` +
              `**交易类型**: 代币交易\n` +
              `**监控钱包**: \`${shortAddress(tx.from || tx.to)}\`\n` +
              `**代币名称**: ${tokenInfo?.name || 'Unknown'}\n` +
              `**代币符号**: ${tokenInfo?.symbol || 'UNKNOWN'}\n` +
              `**合约地址**: \`${tokenInfo?.address || tx.to}\`\n` +
              `**交易哈希**: \`${tx.hash}\`\n` +
              `**区块高度**: ${block.number}\n\n` +
              
              `🔗 **快速链接**\n` +
              `- [查看交易](https://bscscan.com/tx/${tx.hash})\n` +
              `- [Dextools分析](https://www.dextools.io/app/bnb/pair-explorer/${tokenInfo?.address || tx.to})\n` +
              `- [购买代币](https://pancakeswap.finance/swap?outputCurrency=${tokenInfo?.address || tx.to})`
      },
      at: {
        isAtAll: false
      }
    };
  }
  
  // 获取代币信息
  async getTokenInfo(tx) {
    try {
      if (!tx.to) return null;
      
      if (this.tokenCache.has(tx.to)) {
        return this.tokenCache.get(tx.to);
      }
      
      await this.rateLimit();
      
      const tokenContract = new this.web3.eth.Contract([
        {
          constant: true,
          inputs: [],
          name: 'name',
          outputs: [{ name: '', type: 'string' }],
          type: 'function'
        },
        {
          constant: true,
          inputs: [],
          name: 'symbol',
          outputs: [{ name: '', type: 'string' }],
          type: 'function'
        },
        {
          constant: true,
          inputs: [],
          name: 'decimals',
          outputs: [{ name: '', type: 'uint8' }],
          type: 'function'
        }
      ], tx.to);
      
      const [name, symbol, decimals] = await Promise.all([
        tokenContract.methods.name().call().catch(() => 'Unknown'),
        tokenContract.methods.symbol().call().catch(() => 'UNKNOWN'),
        tokenContract.methods.decimals().call().catch(() => 18)
      ]);
      
      const tokenInfo = {
        name: name || 'Unknown Token',
        symbol: symbol || 'UNKNOWN',
        address: tx.to,
        decimals: parseInt(decimals) || 18
      };
      
      this.tokenCache.set(tx.to, tokenInfo);
      setTimeout(() => this.tokenCache.delete(tx.to), 300000);
      
      return tokenInfo;
    } catch (error) {
      console.log(`获取代币信息失败: ${error.message}`);
      return null;
    }
  }
  
  // 发送钉钉通知
  async sendDingTalkNotification(message) {
    try {
      const response = await axios.post(CONFIG.DINGTALK_WEBHOOK, message, {
        timeout: 10000
      });
      
      if (response.data.errcode === 0) {
        console.log('✅ 钉钉通知发送成功');
      } else {
        console.log('❌ 钉钉通知发送失败:', response.data);
      }
    } catch (error) {
      console.error('❌ 发送钉钉通知失败:', error.message);
    }
  }
  
  // 启动备用轮询
  startBackupPolling() {
    setInterval(async () => {
      try {
        await this.rateLimit();
        const currentBlock = await this.web3.eth.getBlockNumber();
        
        for (let i = Math.max(0, currentBlock - 2); i <= currentBlock; i++) {
          await this.processBlock(i);
        }
      } catch (error) {
        console.error('备用轮询错误:', error.message);
      }
    }, CONFIG.RATE_LIMIT.backupPollingInterval);
    
    console.log('✅ 备用轮询已启动');
  }
  
  // 启动统计报告
  startStatsReporting() {
    setInterval(() => {
      const stats = {
        已处理交易: this.processedTransactions.size,
        代币缓存: this.tokenCache.size,
        总请求数: this.requestCount,
        监控钱包数: CONFIG.MONITORED_WALLETS.length,
        当前节点: CONFIG.NODES[this.activeNodeIndex].name
      };
      
      console.log('📊 系统统计:', stats);
    }, 60000);
  }
  
  // ==================== 新增优化功能 ====================
  
  // 启动保活机制
  startKeepAlive() {
    if (!CONFIG.KEEP_ALIVE.enabled) return;
    
    this.keepAliveInterval = setInterval(async () => {
      try {
        await axios.get(CONFIG.KEEP_ALIVE.url, {
          timeout: 10000
        });
        console.log('❤️  保活心跳成功');
      } catch (error) {
        console.log('💔 保活心跳失败:', error.message);
      }
    }, CONFIG.KEEP_ALIVE.interval);
    
    console.log('✅ 自保活机制已启动');
  }
  
  // 启动节点健康检查
  startNodeHealthCheck() {
    setInterval(async () => {
      try {
        const startTime = Date.now();
        const blockNumber = await this.web3.eth.getBlockNumber();
        const responseTime = Date.now() - startTime;
        
        console.log(`🏥 节点健康检查: ${CONFIG.NODES[this.activeNodeIndex].name}, 响应时间: ${responseTime}ms`);
        
        if (responseTime > 5000) {
          console.log('⚠️ 节点响应缓慢，考虑切换');
          this.switchToNextNode();
        }
      } catch (error) {
        console.log('❌ 节点健康检查失败，切换节点');
        this.switchToNextNode();
      }
    }, 2 * 60 * 1000); // 每2分钟检查一次
  }
  
  // 漏块检查机制
  async checkMissedBlocks() {
    try {
      const currentBlock = await this.web3.eth.getBlockNumber();
      if (this.lastProcessedBlock && currentBlock > this.lastProcessedBlock + 1) {
        console.log(`🔍 发现 ${currentBlock - this.lastProcessedBlock - 1} 个漏块，正在补扫...`);
        
        const promises = [];
        for (let i = this.lastProcessedBlock + 1; i <= currentBlock; i++) {
          promises.push(this.processBlock(i));
        }
        await Promise.all(promises);
      }
      this.lastProcessedBlock = currentBlock;
    } catch (error) {
      console.error('漏块检查错误:', error.message);
    }
  }
  
  // 启动成功通知
  async sendStartupNotification() {
    const message = {
      msgtype: 'markdown',
      markdown: {
        title: '🚀 BSC监控系统启动成功',
        text: `### 🟢 BSC钱包监控系统已启动\n\n` +
              `**启动时间**: ${new Date().toLocaleString('zh-CN')}\n` +
              `**监控钱包**: ${CONFIG.MONITORED_WALLETS.length}个\n` +
              `**当前节点**: ${CONFIG.NODES[this.activeNodeIndex].name}\n` +
              `**服务地址**: https://bsc-monitor-4tdg.onrender.com\n\n` +
              `💡 系统已开始监控，有交易时会实时通知`
      },
      at: {
        isAtAll: false
      }
    };
    
    try {
      await axios.post(CONFIG.DINGTALK_WEBHOOK, message, {
        timeout: 10000
      });
      console.log('✅ 启动通知发送成功');
    } catch (error) {
      console.error('❌ 启动通知发送失败:', error.message);
    }
  }
  
  // 管理界面相关方法保持不变
  getMonitoredWallets() {
    return [...CONFIG.MONITORED_WALLETS];
  }
  
  addWallet(walletAddress) {
    const address = walletAddress.toLowerCase();
    if (!CONFIG.MONITORED_WALLETS.includes(address)) {
      CONFIG.MONITORED_WALLETS.push(address);
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
      console.log(`✅ 移除监控钱包: ${address}`);
      return true;
    }
    return false;
  }
  
  getSystemStatus() {
    return {
      isMonitoring: !!this.web3,
      currentBlock: this.lastProcessedBlock,
      monitoredWallets: CONFIG.MONITORED_WALLETS.length,
      processedTransactions: this.processedTransactions.size,
      activeNode: CONFIG.NODES[this.activeNodeIndex].name,
      requestCount: this.requestCount
    };
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
    service: 'BSC钱包监控系统',
    version: '2.0', // 版本号更新
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

// 管理界面API端点（保持不变）
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

// 管理界面页面（保持不变）
app.get('/admin', (req, res) => {
  const status = walletMonitor.getSystemStatus();
  const wallets = walletMonitor.getMonitoredWallets();
  
  res.send(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BSC钱包监控系统 - 管理界面</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #333; border-bottom: 2px solid #eee; padding-bottom: 10px; }
        .status { background: #e8f5e8; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .wallets { margin: 20px 0; }
        .wallet-item { background: #f9f9f9; padding: 10px; margin: 5px 0; border-radius: 4px; border-left: 4px solid #4CAF50; }
        .form-group { margin: 15px 0; }
        input[type="text"] { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 16px; }
        button { background: #4CAF50; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; }
        button:hover { background: #45a049; }
        .delete-btn { background: #f44336; margin-left: 10px; }
        .delete-btn:hover { background: #da190b; }
        .note { background: #fff3cd; padding: 10px; border-radius: 4px; margin: 15px 0; border-left: 4px solid #ffc107; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔍 BSC钱包监控系统 - 管理界面 v2.0</h1>
        
        <div class="note">
            <strong>新功能：</strong> 系统已升级！包含快速通知、多节点优化、防休眠保活等功能。
        </div>
        
        <div class="status">
            <h3>系统状态</h3>
            <p><strong>运行状态:</strong> ${status.isMonitoring ? '✅ 监控中' : '❌ 未运行'}</p>
            <p><strong>当前节点:</strong> ${status.activeNode || '未知'}</p>
            <p><strong>监控钱包数:</strong> ${status.monitoredWallets}</p>
            <p><strong>已处理交易:</strong> ${status.processedTransactions || 0}</p>
            <p><strong>总请求数:</strong> ${status.requestCount || 0}</p>
        </div>
        
        <div class="wallets">
            <h3>监控的钱包地址</h3>
            ${wallets.map(wallet => `
                <div class="wallet-item">
                    <code>${wallet}</code>
                    <button class="delete-btn" onclick="removeWallet('${wallet}')">删除</button>
                </div>
            `).join('')}
            ${wallets.length === 0 ? '<p>暂无监控的钱包</p>' : ''}
        </div>
        
        <div class="form-group">
            <h3>添加监控钱包</h3>
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
    </script>
</body>
</html>
  `);
});

// ==================== 启动服务器和监控 ====================
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🚀 BSC钱包监控系统 v2.0 启动成功!');
  console.log(`📍 本地访问: http://localhost:${PORT}`);
  console.log(`🔧 管理界面: http://localhost:${PORT}/admin`);
  console.log(`❤️ 健康检查: http://localhost:${PORT}/health`);
  console.log('📋 新功能:');
  console.log(`   - ⚡ 5秒快速通知`);
  console.log(`   - 🔄 多节点优化`);
  console.log(`   - ❤️ 防休眠保活`);
  console.log(`   - 🏥 节点健康检查`);
  console.log('='.repeat(60));
  
  // 延迟启动监控
  setTimeout(() => {
    walletMonitor.startMonitoring().catch(error => {
      console.error('❌ 监控系统启动失败:', error);
    });
  }, 2000);
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n👋 收到关闭信号，正在优雅退出...');
  if (walletMonitor.keepAliveInterval) {
    clearInterval(walletMonitor.keepAliveInterval);
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 收到终止信号，正在优雅退出...');
  if (walletMonitor.keepAliveInterval) {
    clearInterval(walletMonitor.keepAliveInterval);
  }
  process.exit(0);
});
