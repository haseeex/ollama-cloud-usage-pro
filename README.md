# Ollama Cloud Usage

在 VS Code 中查看 [Ollama Cloud](https://ollama.com) 的用量与限额 —— 一个简洁的状态栏指示器，加上一个详细的用量面板。

## 功能特性

- **状态栏指示器** —— 一眼掌握 5 小时窗口与每周窗口的用量。悬浮可查看配额详情，包含各模型占比条与重置倒计时。
- **用量面板** —— 点击状态栏图标打开详细面板，包含：
  - 5 小时与每周用量条，按模型拆分为多段（每个模型一种蓝色色调）
  - 每个窗口的实时重置倒计时
  - 本窗口 / 本周使用的模型及请求次数（悬浮条形段可查看模型名与次数）
  - 多账户支持：通过下拉框切换、添加、移除账户
- **自动刷新** —— 按可配置的间隔自动重新加载用量（默认 60 秒）。所有 VS Code 窗口共享同一份用量缓存，多开窗口不会成倍增加 API 请求。
- **可配置间隔** —— 在设置中调整 `ollamaCloud.refreshInterval`（10–86400 秒），或运行 `Ollama Cloud: 设置自动刷新间隔` 命令，或点击面板中的 ⚙ 按钮。
- **UTC 对齐的重置窗口** —— 5 小时窗口在 UTC 00/05/10/15/20 点重置；每周窗口在周一 UTC 00:00 重置。
- **安全存储** —— API 密钥保存在 VS Code Secret Storage 中（也支持 `OLLAMA_API_KEY` 环境变量）。

## 截图

### 用量面板

![用量面板](https://raw.githubusercontent.com/haseeex/ollama-cloud-usage-pro/main/resources/screenshot-panel.png)

### 状态栏

![状态栏](https://raw.githubusercontent.com/haseeex/ollama-cloud-usage-pro/main/resources/screenshot-statusbar.png)

## 使用方法

1. 安装扩展。
2. 点击右下角的 **Ollama Cloud** 状态栏图标，打开用量面板。
3. 点击 ＋ 并粘贴你的 Ollama API 密钥。也可以在启动 VS Code 前设置 `OLLAMA_API_KEY` 环境变量。
4. 用量会按配置的间隔自动刷新（默认 60 秒）；点击面板中的 ⟳ 可手动刷新，点击 ⚙ 可修改刷新间隔。

## 命令

- `Ollama Cloud: 刷新用量`
- `Ollama Cloud: 打开用量面板`
- `Ollama Cloud: 设置自动刷新间隔`
- `Ollama Cloud: 添加账户`
- `Ollama Cloud: 移除账户`
- `Ollama Cloud: 切换账户`

## 设置项

- `ollamaCloud.refreshInterval` —— 自动刷新间隔（秒），范围 10–86400，默认 60。

### 关于多个 VS Code 窗口

每个 VS Code 窗口都会运行独立的扩展宿主进程和自己的定时器，如果不做协调，N 个窗口每个间隔就会发出 N 次请求。本扩展会在全局存储中维护一份用量缓存，所有窗口在请求前都会先读取它：

- 当缓存仍然新鲜时，窗口会复用其他窗口抓取的快照 —— 无论开多少个窗口，实际请求频率都保持在每个间隔一次。
- 当多个窗口同时到期时，跨窗口锁会确保只有一个窗口真正发起请求，其余窗口复用其结果。
- 手动刷新（⟳ / `Ollama Cloud: 刷新用量`）始终绕过缓存。

## 许可协议与致谢

### 原始作品

本项目基于 **[longnh0411/ollama-cloud-usage](https://github.com/longnh0411/ollama-cloud-usage)** 二次开发。

- 原作者：**Nguyễn Hoàng Long**（GitHub: [@longnh0411](https://github.com/longnh0411)，邮箱：longnh94@fpt.com）
- 原始作品版权：Copyright 2026 Nguyễn Hoàng Long
- 授权协议：Apache License 2.0

根据 Apache License 2.0 第 4 条的要求，衍生作品必须保留原作品的版权声明、许可证文本与署名。本项目已完整保留上述信息，详见 [NOTICE](./NOTICE) 文件。

### 本衍生作品

- 二改作者：**vancat**（GitHub: [@haseeex](https://github.com/haseeex)）
- 衍生作品版权：Copyright 2026 vancat
- 授权协议：Apache License 2.0

本衍生作品在原项目基础上新增的主要改动包括：跨窗口请求协调（多开 VS Code 窗口不会成倍增加 API 请求）、可配置的自动刷新间隔、状态栏与面板的上次更新时间显示，以及全部界面文案中文化。

### 许可证

Licensed under the Apache License, Version 2.0.
详见 [LICENSE](./LICENSE) 文件。
