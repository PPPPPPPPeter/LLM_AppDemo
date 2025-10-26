<template>
  <AppLayout>
    <ChatInterface />
  </AppLayout>
</template>

<script setup>
import AppLayout from './components/Layout/AppLayout.vue'
import ChatInterface from './components/ChatInterface.vue'
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  height: 100%;
  overflow: hidden;
}

body {
  background: #1e1e1e;
  color: #fff;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
}
</style>