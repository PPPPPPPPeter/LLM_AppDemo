FROM node:18-alpine

# 如果需要jest或其他测试框架可以在这里装
# RUN npm install -g jest

WORKDIR /code

CMD ["node"]