# edit

在文件中进行精确字符串替换。如果未找到 `oldString` 或找到多处匹配（除非设置 `replaceAll`），会返回错误。

## 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `path` | `string` | 是 | 要编辑的文件的绝对路径 |
| `oldString` | `string` | 是 | 要查找并替换的精确文本 |
| `newString` | `string` | 是 | 替换后的文本 |
| `replaceAll` | `boolean` | 否 | 替换所有匹配项而非仅第一处 |

## 行为

- 读取文件并精确搜索 `oldString`
- 如果未找到 `oldString`，返回错误
- 如果找到多处匹配且未设置 `replaceAll`，返回错误，建议使用 `replaceAll: true` 或提供更多上下文使匹配唯一
- 当 `replaceAll` 为 `true` 时，替换所有 `oldString` 的出现
- 返回包含文件路径的成功信息

## 示例

替换单处：

```json
{ "path": "/home/user/project/src/index.ts", "oldString": "console.log('hello')", "newString": "console.log('world')" }
```

替换所有匹配项：

```json
{ "path": "/home/user/project/src/index.ts", "oldString": "var ", "newString": "const ", "replaceAll": true }
```

## 注册

```typescript
import { editTool } from "@piaoxianguo/miniagent";
agent.register(editTool);
```
