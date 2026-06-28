FROM node:20-slim

# Install Python3 + OpenCV dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip3 install --break-system-packages \
    opencv-python-headless \
    Pillow \
    numpy

# Install sharp dependencies
RUN apt-get update && apt-get install -y libvips-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

# Copy compiled JS and scripts
COPY dist ./dist
COPY scripts ./scripts

# Create uploads directory
RUN mkdir -p /app/uploads

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/main.js"]