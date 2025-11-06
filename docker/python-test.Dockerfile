FROM python:3.11-alpine

# 安装编译依赖（某些库需要）
RUN apk add --no-cache \
    gcc \
    g++ \
    musl-dev \
    linux-headers \
    libffi-dev \
    openssl-dev

# 安装测试框架
RUN pip install --no-cache-dir --break-system-packages \
    pytest \
    behave

# 预装常用的 Python 库
RUN pip install --no-cache-dir --break-system-packages \
    # 数据处理
    numpy \
    pandas \
    scipy \
    # HTTP 请求
    requests \
    # JSON 处理增强
    # 日期时间处理
    python-dateutil \
    # 环境变量
    python-dotenv \
    # 数据验证
    pydantic \
    # Mock 工具
    pytest-mock \
    # 更好的断言
    pytest-assume \
    # HTTP mock
    responses \
    # 字符串处理
    # 正则增强
    regex \
    # YAML 支持
    pyyaml \
    # 配置文件
    configparser

WORKDIR /code

CMD ["python3"]
