<template>
  <div class="file-tree-item">
    <div
        :class="['item-row', { active: isSelected, folder: item.type === 'folder' }]"
        :style="{ paddingLeft: (depth * 16 + 10) + 'px' }"
        @click="handleClick"
    >
      <!-- 展开/折叠图标 (仅文件夹) -->
      <span
          v-if="item.type === 'folder'"
          class="expand-icon"
          @click.stop="toggleExpand"
      >
        {{ isExpanded ? '▼' : '▶' }}
      </span>

      <!-- 文件/文件夹图标 -->
      <span class="icon">{{ getIcon(item) }}</span>

      <!-- 文件名 -->
      <input
          v-if="item.renaming"
          v-model="item.name"
          @blur="item.renaming = false"
          @keyup.enter="item.renaming = false"
          @click.stop
          class="rename-input"
      />
      <span v-else class="name">{{ item.name }}</span>

      <!-- 操作按钮 -->
      <div class="actions">
        <button @click.stop="$emit('rename', item)" title="Rename">✏️</button>
        <button @click.stop="$emit('delete', item)" title="Delete">×</button>
      </div>
    </div>

    <!-- 子项 (仅文件夹且展开时) -->
    <div v-if="item.type === 'folder' && isExpanded && item.children" class="children">
      <FileTreeItem
          v-for="child in item.children"
          :key="child.id"
          :item="child"
          :depth="depth + 1"
          :is-selected="isChildSelected(child)"
          @select="$emit('select', $event)"
          @rename="$emit('rename', $event)"
          @delete="$emit('delete', $event)"
      />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  item: {
    type: Object,
    required: true
  },
  depth: {
    type: Number,
    default: 0
  },
  isSelected: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['select', 'rename', 'delete'])

const isExpanded = ref(true)

function toggleExpand() {
  isExpanded.value = !isExpanded.value
}

function handleClick() {
  emit('select', props.item)
}

function isChildSelected(child) {
  // 这个逻辑由父组件处理，这里只是占位
  return false
}

function getIcon(item) {
  if (item.type === 'folder') {
    return isExpanded.value ? '📂' : '📁'
  }
  if (item.name.endsWith('.py')) return '🐍'
  if (item.name.endsWith('.feature')) return '🥒'
  return '📄'
}
</script>

<style scoped>
.file-tree-item {
  user-select: none;
}

.item-row {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 13px;
  border-bottom: 1px solid #2d2d30;
  min-height: 32px;
  position: relative;
}

.item-row:hover {
  background: #2d2d30;
}

.item-row.active {
  background: #37373d;
}

.item-row.folder {
  font-weight: 500;
}

.expand-icon {
  font-size: 10px;
  color: #858585;
  width: 12px;
  display: inline-block;
  text-align: center;
  flex-shrink: 0;
}

.icon {
  font-size: 14px;
  flex-shrink: 0;
}

.name {
  flex: 1;
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rename-input {
  flex: 1;
  background: #3e3e42;
  border: 1px solid #0e639c;
  color: white;
  padding: 2px 4px;
  font-family: monospace;
  font-size: 12px;
}

.actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.2s;
}

.item-row:hover .actions {
  opacity: 1;
}

.actions button {
  background: none;
  border: none;
  color: #858585;
  cursor: pointer;
  padding: 2px 4px;
  font-size: 12px;
}

.actions button:hover {
  color: white;
}

.children {
  /* 子项容器 */
}
</style>