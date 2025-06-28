#!/bin/bash

echo "🤖 Starting PixelCanvas Autonomous Claude System..."
echo "⚡ This system will continuously improve PixelCanvas automatically"
echo "🔄 Improvement cycles run every 5 minutes"

cd /data/data/com.termux/files/home/pixcel_canvas

if [ "$1" = "--daemon" ]; then
    echo "🔧 Starting in daemon mode..."
    nohup node autonomous-claude.js > autonomous.log 2>&1 &
    echo $! > autonomous.pid
    echo "✅ Started as daemon (PID: $(cat autonomous.pid))"
    echo "📊 Monitor: tail -f autonomous.log"
    echo "🛑 Stop: kill $(cat autonomous.pid)"
else
    echo "🤖 Starting in foreground mode..."
    node autonomous-claude.js
fi