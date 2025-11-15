// 🚀 BSC钱包监控系统 - 简化部署测试版
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// 健康检查端点
app.get('/', (req, res) => {
  res.json({ 
    status: '运行中', 
    service: 'BSC钱包监控系统',
    version: '简化测试版',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`✅ 服务器启动成功，运行在端口 ${PORT}`);
  console.log(`📍 服务地址: http://localhost:${PORT}`);
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('👋 优雅退出');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('👋 优雅退出');
  process.exit(0);
});
