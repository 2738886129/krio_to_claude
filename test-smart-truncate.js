/**
 * 测试智能截断 description 功能
 */

// 复制 smartTruncateDescription 函数用于测试
function smartTruncateDescription(desc, maxLength) {
  if (!desc || desc.length <= maxLength) return desc;
  
  const sections = [];
  let currentSection = { title: 'intro', content: '', priority: 1 };
  
  const lines = desc.split('\n');
  for (const line of lines) {
    const headerMatch = line.match(/^#+\s*(.+)$/) || line.match(/^([A-Z][A-Za-z\s]+):$/);
    if (headerMatch) {
      if (currentSection.content.trim()) {
        sections.push(currentSection);
      }
      const title = headerMatch[1].toLowerCase();
      let priority = 5;
      if (title.includes('rule') || title.includes('important') || title.includes('critical')) {
        priority = 2;
      } else if (title.includes('usage') || title.includes('parameter') || title.includes('when to use')) {
        priority = 3;
      } else if (title.includes('example')) {
        priority = 4;
      } else if (title.includes('commit') || title.includes('pull request') || title.includes('pr')) {
        priority = 6;
      }
      currentSection = { title: title, content: line + '\n', priority };
    } else {
      currentSection.content += line + '\n';
    }
  }
  if (currentSection.content.trim()) {
    sections.push(currentSection);
  }
  
  sections.sort((a, b) => a.priority - b.priority);
  
  let result = '';
  const addedSections = [];
  
  for (const section of sections) {
    const sectionText = section.content.trim();
    if (result.length + sectionText.length + 10 < maxLength) {
      addedSections.push(section);
      result += sectionText + '\n\n';
    } else if (section.priority <= 2) {
      const remaining = maxLength - result.length - 50;
      if (remaining > 200) {
        result += sectionText.substring(0, remaining) + '...\n\n';
      }
      break;
    }
  }
  
  return result.trim();
}

// Bash 工具的完整 description（模拟）
const bashDescription = `Executes a given bash command in a persistent shell session with optional timeout, ensuring proper handling and security measures.

IMPORTANT: This tool is for terminal operations like git, npm, docker, etc. DO NOT use it for file operations (reading, writing, editing, searching, finding files) - use the specialized tools for this instead.

Before executing the command, please follow these steps:

1. Directory Verification:
   - If the command will create new directories or files, first use ls to verify the parent directory exists

2. Command Execution:
   - Always quote file paths that contain spaces with double quotes

# Rules
- The command argument is required.
- You can specify an optional timeout in milliseconds (up to 600000ms / 10 minutes).
- If the output exceeds 30000 characters, output will be truncated.
- Avoid using Bash with find, grep, cat, head, tail, sed, awk, or echo commands.
- When issuing multiple commands, use && to chain them together.
- Try to maintain your current working directory throughout the session.

# Usage notes
- It is very helpful if you write a clear, concise description of what this command does.
- You can use the run_in_background parameter to run the command in the background.

# Examples
<good-example>
pytest /foo/bar/tests
</good-example>
<bad-example>
cd /foo/bar && pytest tests
</bad-example>

# Committing changes with git

Only create commits when requested by the user. If unclear, ask first. When the user asks you to create a new git commit, follow these steps carefully:

Git Safety Protocol:
- NEVER update the git config
- NEVER run destructive/irreversible git commands (like push --force, hard reset, etc) unless the user explicitly requests them
- NEVER skip hooks (--no-verify, --no-gpg-sign, etc) unless the user explicitly requests it
- NEVER run force push to main/master, warn the user if they request it
- Avoid git commit --amend. ONLY use --amend when ALL conditions are met:
  (1) User explicitly requested amend, OR commit SUCCEEDED but pre-commit hook auto-modified files that need including
  (2) HEAD commit was created by you in this conversation (verify: git log -1 --format='%an %ae')
  (3) Commit has NOT been pushed to remote (verify: git status shows "Your branch is ahead")
- CRITICAL: If commit FAILED or was REJECTED by hook, NEVER amend - fix the issue and create a NEW commit
- CRITICAL: If you already pushed to remote, NEVER amend unless user explicitly requests it (requires force push)
- NEVER commit changes unless the user explicitly asks you to.

1. Run git status and git diff commands in parallel
2. Analyze all staged changes and draft a commit message
3. Create the commit with a message ending with Co-Authored-By
4. If the commit fails due to pre-commit hook, fix the issue and create a NEW commit

Important notes:
- NEVER run additional commands to read or explore code
- DO NOT push to the remote repository unless the user explicitly asks
- IMPORTANT: Never use git commands with the -i flag

# Creating pull requests
Use the gh command via the Bash tool for ALL GitHub-related tasks.

IMPORTANT: When the user asks you to create a pull request, follow these steps carefully:

1. Run git status, git diff, and git log commands in parallel
2. Analyze all changes that will be included in the pull request
3. Create PR using gh pr create with the format below

<example>
gh pr create --title "the pr title" --body "..."
</example>

Important:
- DO NOT use the TodoWrite or Task tools
- Return the PR URL when you're done`;

console.log('=== 智能截断测试 ===\n');
console.log(`原始长度: ${bashDescription.length} 字符\n`);

// 测试不同的截断长度
const testLengths = [4500, 3000, 2000, 1500];

for (const maxLen of testLengths) {
  const truncated = smartTruncateDescription(bashDescription, maxLen);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`截断到 ${maxLen} 字符 (实际: ${truncated.length})`);
  console.log('='.repeat(60));
  console.log(truncated);
  console.log('\n');
}

// 验证关键内容是否保留
console.log('\n=== 验证关键内容保留 ===');
const result = smartTruncateDescription(bashDescription, 2000);
const checks = [
  ['核心描述', result.includes('Executes a given bash command')],
  ['Rules 部分', result.includes('Rules') || result.includes('rule')],
  ['timeout 说明', result.includes('timeout')],
  ['git commit 详细说明被删除', !result.includes('Git Safety Protocol')],
  ['PR 创建详细说明被删除', !result.includes('Creating pull requests')]
];

for (const [name, passed] of checks) {
  console.log(`${passed ? '✅' : '❌'} ${name}`);
}
