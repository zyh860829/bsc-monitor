const express = require('express');
const axios = require('axios');
const Web3 = require('web3');
const app = express();

// 配置区 ==========================================
// ！！！请将下面的 YOUR_DINGTALK_URL 替换为您的钉钉机器人Webhook地址 ！！！
const DINGTALK_WEBHOOK = 'YOUR_DINGTALK_URL';
const INFURA_WSS_URL = 'wss://bsc-mainnet.infura.io/ws/v3/1534e27b86374dea86bcb87d984d2a61';
// ！！！请将下面的钱包地址替换成您真正要监控的地址 ！！！
const WALLETS_TO_MONITOR = [
    '0x978196d7f6c4356b5fec6c5d6e5b0a6b5c9c8a1b', // 替换为实际要监控的钱包1
    '0xd62a74b7e5b5c5c5c5c5c5c5c5c5c5c5c5c5c5c', // 替换为实际要监控的钱包2
    '0x9dfa09b6c4c67a5c55bca8c6f0d0361f4a2f16c5'  // 替换为实际要监控的钱包3
];
// 配置区结束 ======================================

app.use(express.json());

// 初始化Web3
const web3 = new Web3(INFURA_WSS_URL);

// 生成BscScan链接
function getBscScanLink(txHash) {
    return `https://bscscan.com/tx/${txHash}`;
}

// 发送钉钉消息
async function sendDingTalkAlert(message) {
    try {
        if (!message.markdown.text.includes('交易监控')) {
            message.markdown.text += '\n\n**关键词：交易监控**';
        }
        
        await axios.post(DINGTALK_WEBHOOK, message, {
            headers: { 'Content-Type': 'application/json' }
        });
        console.log('钉钉消息发送成功');
    } catch (error) {
        console.error('发送钉钉消息失败:', error.message);
    }
}

// 检查交易是否与监控的钱包相关
function isRelevantTransaction(tx) {
    if (!tx || !tx.from) return false;
    
    const from = tx.from.toLowerCase();
    const to = tx.to ? tx.to.toLowerCase() : null;
    
    return WALLETS_TO_MONITOR.some(wallet => 
        wallet.toLowerCase() === from || wallet.toLowerCase() === to
    );
}

// 开始实时监控
async function startRealTimeMonitoring() {
    console.log('开始实时监控BSC链...');
    
    try {
        // 订阅新区块头
        const subscription = web3.eth.subscribe('newBlockHeaders');
        
        subscription.on('data', async (blockHeader) => {
            try {
                console.log(`检测到新区块: #${blockHeader.number}`);
                
                // 获取完整的区块信息，包括所有交易
                const block = await web3.eth.getBlock(blockHeader.number, true);
                
                if (block && block.transactions) {
                    console.log(`区块 #${block.number} 包含 ${block.transactions.length} 笔交易`);
                    
                    // 检查区块中的每笔交易
                    for (const tx of block.transactions) {
                        if (isRelevantTransaction(tx)) {
                            await processRelevantTransaction(tx, block.number);
                        }
                    }
                }
            } catch (error) {
                console.error('处理区块错误:', error.message);
            }
        });
        
        subscription.on('error', (error) => {
            console.error('区块订阅错误:', error);
            // 尝试重新连接
            setTimeout(startRealTimeMonitoring, 5000);
        });
        
        console.log('区块订阅已启动');
        
    } catch (error) {
        console.error('启动监控失败:', error);
        setTimeout(startRealTimeMonitoring, 5000);
    }
}

// 处理相关交易
async function processRelevantTransaction(tx, blockNumber) {
    const from = tx.from.toLowerCase();
    const to = tx.to ? tx.to.toLowerCase() : '合约创建';
    
    // 确定交易方向
    const isFromMonitored = WALLETS_TO_MONITOR.some(wallet => wallet.toLowerCase() === from);
    const isToMonitored = WALLETS_TO_MONITOR.some(wallet => wallet.toLowerCase() === to);
    
    let direction = '';
    if (isFromMonitored && isToMonitored) {
        direction = '🔄 自交易';
    } else if (isFromMonitored) {
        direction = '↗️ 转出';
    } else if (isToMonitored) {
        direction = '↘️ 转入';
    }
    
    const value = web3.utils.fromWei(tx.value || '0', 'ether');
    
    const message = {
        msgtype: "markdown",
        markdown: {
            title: "🚨 BSC交易提醒",
            text: `## BSC钱包交易监控\n\n` +
                  `**交易哈希：** [${tx.hash.slice(0, 12)}...](${getBscScanLink(tx.hash)})\n\n` +
                  `**区块高度：** ${blockNumber}\n\n` +
                  `**交易方向：** ${direction}\n\n` +
                  `**从地址：** ${tx.from.slice(0, 8)}...\n\n` +
                  `**到地址：** ${tx.to ? tx.to.slice(0, 8) + '...' : '合约创建'}\n\n` +
                  `**金额：** ${value} BNB\n\n` +
                  `**Gas价格：** ${web3.utils.fromWei(tx.gasPrice || '0', 'gwei')} Gwei\n\n` +
                  `**⏰ 实时交易确认！**`
        }
    };

    console.log(`发送通知: ${tx.hash}`);
    await sendDingTalkAlert(message);
}

// 健康检查端点
app.get('/', (req, res) => {
    res.send('BSC实时监控服务运行正常!');
});

// 启动服务
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`BSC实时监控服务启动在端口 ${PORT}`);
    startRealTimeMonitoring();
});
