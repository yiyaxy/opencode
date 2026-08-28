# M0 模块审计清单

审计基线：`fork-migration` 分支（2026-08-28）。

本清单按“删除、隔离、保留、未来复用”分类，先记录引用和构建边界，再执行目录级处理。除已完成的语言资源清理外，不以目录数量作为清理目标。

## 分类规则

| 分类 | 处理原则 |
| --- | --- |
| 删除 | 已确认无运行时、构建、发布或未来产品价值，并完成引用检查 |
| 隔离 | 当前不进入 A 层默认发布，但保留源码，待 B/C 场景确认后再决定 |
| 保留 | A 层运行、构建、数据库、协议、工具或开发流程直接依赖 |
| 未来复用 | 当前不是 A 层必需，但对 B/C 编排、平台、连接器或治理有明确复用价值 |

## 保留

| 模块 | 证据与用途 | 当前动作 |
| --- | --- | --- |
| `packages/desktop` | Desktop 主入口，依赖 `@opencode-ai/app` 和 `@opencode-ai/ui` | 保留并作为主要产品入口 |
| `packages/app` | Web UI、会话、模型、审批、Diff 和终端界面 | 保留，作为共享界面层 |
| `packages/ui`、`packages/session-ui` | 设计系统和会话组件，被 App、Desktop、TUI、Storybook 复用 | 保留 |
| `packages/opencode` | 本地服务、Agent Runtime、CLI 命令和 HTTP API | 保留，作为运行时主体 |
| `packages/core`、`packages/server` | 核心领域、数据库、服务端和实例路由 | 保留 |
| `packages/schema`、`packages/protocol` | 数据模型、HTTP 协议和类型边界 | 保留 |
| `packages/client`、`packages/sdk/js`、`packages/sdk-next` | 网络客户端、生成客户端和未来 Effect 运行时 | 保留，禁止直接编辑生成目录 |
| `packages/cli`、`packages/tui` | 专业用户入口和无图形环境入口 | 保留 |
| `packages/llm`、`packages/plugin`、`packages/codemode` | Provider、插件和受限代码执行能力 | 保留，作为 A/B 层能力 |
| `packages/http-recorder`、`packages/httpapi-codegen` | LLM 录制回放和协议客户端生成 | 保留，服务测试与生成流程 |
| `packages/effect-*`、`packages/script` | SQLite 适配、构建脚本和迁移工具 | 保留 |

## 隔离

| 模块 | 隔离原因 | 隔离方式 |
| --- | --- | --- |
| `packages/web` | 公共文档/网站入口，不是本地 A 层运行必需 | 保留源码，不加入本地应用启动链；后续改造成内部文档入口 |
| `packages/storybook` | 组件开发工具，不进入生产包 | 仅开发依赖，继续服务统一设计系统 |
| `packages/slack` | C 层连接器候选，不应进入 A 层默认安装包 | 保留独立包，待业务连接器需求确认 |
| `packages/console/*` | 公共云控制台、计费、账户和运营逻辑 | 与本地产品解耦，暂不删除，后续评估 C 层管理端复用 |
| `packages/stats/*` | 公共统计与数据服务，不属于 A 层闭环 | 暂不打包，保留统计组件供内部成本与质量分析评估 |
| `packages/enterprise` | 独立企业 Web 入口，当前没有 A 层运行时引用 | 保留独立包，待确定集中服务端和管理后台边界 |
| `packages/function` | 独立 Cloudflare/GitHub 函数包，当前无产品运行时引用 | 保留源码，先从默认开发/发布流程隔离 |
| `infra/`、`sst.config.ts` | 依赖外部云环境，尚未确定内部部署架构 | 不删除，待部署方案确定后替换 |
| `artifacts/` | 可能包含构建、发布或品牌资源 | 完成资源引用检查后再决定 |

## 删除

当前没有新增目录级删除项。

已完成的删除范围仅限语言收敛提交 `68819552`：非英文、简体中文、繁体中文的语言资源和对应文档，共 785 个文件变更。后续删除必须单独提交，并附引用检查结果和恢复点。

## 引用与构建检查结果

- Workspace 共发现 35 个 `package.json`，根 workspace 会自动纳入 `packages/*`、`packages/console/*`、`packages/stats/*`、SDK 和 Slack。
- A 层运行时依赖链集中在 `desktop → app/ui`、`app → core/schema/session-ui/ui`、`opencode → core/server/protocol/schema/llm/plugin/tui`。
- `codemode`、`sdk-next`、`http-recorder`、`httpapi-codegen` 虽不是独立入口，但已被运行时或生成流程引用，不能按“未被界面直接打开”删除。
- `console/*`、`stats/*`、`web`、`enterprise`、`function`、`slack`、`storybook` 均应先隔离再评估，不得在 M0 直接移除。

## 下一步门槛

1. 完成 A 层核心包的类型检查和构建基线。
2. 对公共域名、遥测、分享、更新和安装入口建立独立清单。
3. 为每个隔离模块记录负责人、目标场景和重新接入条件。
4. 只有引用检查、构建检查和产品决策都通过后，才允许新增删除提交。
