# M0 外部端点与数据流清单

审计基线：`upstream-sync` 分支（2026-08-31）。

本清单只记录源码中发现的外部网络端点、用途和内部化动作，不包含任何凭据、Token、内部域名或真实环境值。M0 阶段不直接替换端点，先完成归类和产品决策。

## 端点分类

| 类别 | 处理原则 |
| --- | --- |
| 内部化 | 改为公司域名、内部网关或可配置地址，并默认关闭公共服务 |
| 受控保留 | 仍需访问第三方，但通过 Provider 白名单、代理、缓存或版本锁定控制 |
| A 层禁用 | 不进入本地编程助手默认安装包，保留隔离源码 |
| 本地通信 | 只用于本机 App、CLI、TUI 与服务端之间的通信，不视为外部依赖 |

## 运行时端点

| 端点或来源 | 发现位置 | 用途 | M1 动作 | 分类 |
| --- | --- | --- | --- | --- |
| `OPENCODE_MODELS_URL`，默认 `https://models.opencode.ai` | `packages/core/src/models-dev.ts`、`packages/cli/script/generate.ts` | 模型目录和 Provider 元数据 | 统一为内部模型目录；保留显式环境变量覆盖；明确离线缓存策略 | 内部化 |
| `OPENCODE_MODELS_URL`，脚本默认 `https://models.dev` | `packages/opencode/script/generate.ts` | 生成模型快照 | 与运行时默认值统一，避免生成结果和运行时目录不一致 | 内部化 |
| `https://opencode.ai/console` | `packages/core/src/plugin/provider/opencode.ts` | OpenCode Provider 设备授权和 OAuth | 公司网关确定前不启用；改为可配置 Provider 或从 A 层默认列表移除 | 内部化 |
| `https://api.opencode.ai` | `packages/opencode/src/cli/cmd/github.handler.ts` | GitHub Agent 安装信息和相关 API | A 层默认关闭；若保留，迁移到内部 GitHub App 服务并增加策略开关 | 内部化 |
| `https://app.opencode.ai` | `packages/opencode/src/server/shared/ui.ts` | 服务端代理 Web UI | Desktop 使用本地打包 UI；远程 UI 改为内部静态资源或明确的受控地址 | 内部化 |
| `https://opncd.ai` | `packages/opencode/src/share/share-next.ts` | 会话分享服务默认地址 | 默认禁用公共分享；内部需要时部署公司分享服务并设置显式地址 | 内部化 |
| `https://opencode.ai` / `https://dev.opencode.ai` | `packages/opencode/src/cli/cmd/github.handler.ts` | GitHub PR 中的会话分享链接 | 与内部分享服务绑定，禁止在公开 PR 中泄露内部会话内容 | 内部化 |
| `https://social-cards.sst.dev` | `packages/opencode/src/cli/cmd/github.handler.ts` | GitHub PR 会话卡片图片 | 删除或改为内部渲染；不得向公共服务发送模型、版本和会话标识 | 内部化 |
| `stats.opencode.ai` / `stats.dev.opencode.ai` | `packages/console/app/src/lib/stats-proxy.ts` | 公共统计站点代理 | 不纳入 A 层；C 层需要统计时重新设计内部数据边界 | A 层禁用 |

## 安装、更新与发布端点

| 端点或来源 | 发现位置 | 用途 | M1 动作 | 分类 |
| --- | --- | --- | --- | --- |
| `https://opencode.ai/install` | `packages/opencode/src/installation/index.ts`、Desktop WSL 启动逻辑、CI 文档 | 安装脚本和 WSL 安装 | 替换为公司安装源或签名安装包；WSL 不再静默执行公共脚本 | 内部化 |
| `api.github.com/repos/anomalyco/opencode/releases/latest` | `packages/opencode/src/installation/index.ts`、Desktop 发布脚本 | 检查最新版本和下载信息 | 改为公司制品仓库；更新清单必须签名、校验和可回滚 | 内部化 |
| `github.com/anomalyco/opencode/releases/...` | `packages/console/app`、`packages/opencode/script/publish.ts` | 公共下载页、Homebrew、发行制品 | A 层不依赖公共下载页；发布脚本改为 Fork/公司仓库后再启用 | 内部化 |
| `api.github.com` | GitHub 集成、变更日志、Desktop 发布脚本 | GitHub API | 仅在保留 GitHub 集成时使用；设置网络白名单和速率限制 | 受控保留 |

## Provider 与模型请求

| 来源 | 典型端点 | 用途 | M1 动作 | 分类 |
| --- | --- | --- | --- | --- |
| `packages/llm/src/protocols/*` | OpenAI、Anthropic、Gemini、Bedrock 等默认 Base URL | 直接访问模型 Provider | 由内部 Model Gateway 统一路由；Provider 白名单、数据等级和区域策略由网关控制 | 受控保留 |
| `packages/core/src/plugin/provider/openai-compatible-profile.ts` | DeepSeek、OpenRouter、Groq、Together、xAI 等 | OpenAI 兼容 Provider | 默认不预置未批准 Provider；保留自定义 Base URL 能力但必须经过策略校验 | 受控保留 |
| `HTTP-Referer: https://opencode.ai/` | `packages/core/src/plugin/provider/*`、`packages/opencode/src/provider/provider.ts` | Provider 归因请求头 | 删除公共品牌值或改为内部可配置值；避免把内部请求归因到上游品牌 | 内部化 |

## 遥测与错误监控

| 来源 | 配置方式 | 用途 | M1/M2 动作 | 分类 |
| --- | --- | --- | --- | --- |
| Sentry | `VITE_SENTRY_DSN`、`SENTRY_*` | App/Desktop 错误监控与 Source Map | M1 默认关闭；M2 评估内部 Sentry 或自建错误平台，明确脱敏与保存周期 | 内部化 |
| OpenTelemetry OTLP | `OTEL_EXPORTER_OTLP_ENDPOINT`、`OTEL_EXPORTER_OTLP_HEADERS` | 服务端和 LLM 调用链路追踪 | 仅允许公司 OTLP 地址；凭据由运行环境注入，不写入仓库和普通配置 | 内部化 |
| 用户名、模型、会话属性 | `packages/core/src/config.ts`、LLM telemetry | 追踪身份和调用元数据 | M2 前完成字段白名单、匿名化、退出机制和审计 | 内部化 |

## LSP、语法解析器与其他下载

| 来源 | 用途 | M1 动作 | 分类 |
| --- | --- | --- | --- |
| `api.github.com/repos/*/releases/latest` | LSP（ZLS、clangd、Kotlin、Lua、TexLab、Tinymist 等）版本发现 | 固定版本并迁移到内部缓存/制品代理；下载前校验哈希 | 受控保留 |
| `github.com/anomalyco/tree-sitter-*/releases` | TUI Tree-sitter WASM 解析器 | 迁移到公司镜像或在构建时打包；禁止运行时无审查下载 | 受控保留 |
| 用户配置的 MCP、Web Fetch、Provider URL | 外部工具和业务 API | 统一纳入权限、域名白名单、审计和超时策略 | 受控保留 |

## 隔离模块中的云服务

以下端点只出现在 `packages/console/*`、`packages/stats/*`、`packages/function` 或 `infra/`，不属于 A 层默认运行链：

- Stripe、Honeycomb、Discord 支持接口。
- 公共站点法律、下载、营销和邮件链接。
- Cloudflare/SST 资源、统计域名和分享对象存储。

这些模块按 [M0 模块审计清单](./module-audit.md) 隔离保留，不在本次端点替换中接入内部产品。若进入 C 层，必须重新完成数据流、权限、合规和部署评审。

## 本地通信与非外部依赖

- App 默认通过 `http://localhost:<port>` 连接本地服务端。
- Desktop Sidecar、CLI、TUI 与服务端之间的 Basic Auth 环境变量属于本地运行安全配置，不应写入公开仓库。
- `example.com`、文档 Schema、测试 Fixture 和主题 Schema 中的 URL 仅用于开发或格式校验，不应被当作生产端点。

## M0 结论与进入 M1 的门槛

1. 端点已经按“内部化、受控保留、A 层禁用、本地通信”完成归类。
2. 未经公司网关、品牌、安装源和遥测方案确认，不修改生产端点或提交真实配置。
3. M1 首先处理模型目录、公共 Provider、安装更新、分享和 Referer；遥测与 SSO 随 M2 安全加固落地。
4. 每次替换端点必须同时补充：配置来源、网络策略、数据字段、超时/重试、离线行为、回滚方式和验收记录。

M1 已完成一项低风险内部化：运行时 Agent 提示不再强制访问 `opencode.ai` 文档或公共 GitHub 反馈入口。模型目录、Provider、安装更新、分享和 Referer 仍等待公司地址与策略确认后处理。
