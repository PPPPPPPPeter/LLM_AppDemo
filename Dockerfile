FROM node:18-alpine

# 安装Python和测试工具
RUN apk add --no-cache python3 py3-pip

# 安装Python测试框架
RUN pip3 install --break-system-packages pytest behave

# 设置工作目录
WORKDIR /app

# 只在容器里临时运行代码，不需要复制项目文件
CMD ["node"]