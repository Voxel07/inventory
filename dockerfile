# Use Node.js for building the app
FROM node:20-alpine as build

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the app
COPY . .

# Define build arguments
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_KEY

# Set environment variables for Vite
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_KEY=${VITE_SUPABASE_KEY}

# Build the app
RUN npm run build

# Serve the app with Nginx
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
