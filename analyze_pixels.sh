#\!/bin/bash

# Analyze pixel distribution using curl
echo "Fetching pixel data from Supabase..."

# Fetch pixel data
response=$(curl -s -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxndmpkZWZreWV1dnF1emNra3ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk3MjMxNzEsImV4cCI6MjA2NTI5OTE3MX0.AqXyT6m78-O7X-ulzYdfBsLLMVsRoelpOUvPp9PCqiY" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxndmpkZWZreWV1dnF1emNra3ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk3MjMxNzEsImV4cCI6MjA2NTI5OTE3MX0.AqXyT6m78-O7X-ulzYdfBsLLMVsRoelpOUvPp9PCqiY" \
  "https://lgvjdefkyeuvquzckkvb.supabase.co/rest/v1/pixels?select=sector_x,sector_y&limit=5000")

# Parse JSON and analyze
echo "$response"  < /dev/null |  jq -r '.[] | "\(.sector_x),\(.sector_y)"' | sort | uniq -c | sort -nr | head -20 > sector_counts.txt

echo "Top 20 sectors by pixel count:"
cat sector_counts.txt

# Check sector bounds
echo -e "\nAnalyzing sector bounds..."
echo "$response" | jq -r '[.[] | .sector_x] | min' > min_x.txt
echo "$response" | jq -r '[.[] | .sector_x] | max' > max_x.txt
echo "$response" | jq -r '[.[] | .sector_y] | min' > min_y.txt
echo "$response" | jq -r '[.[] | .sector_y] | max' > max_y.txt

echo "Sector X range: $(cat min_x.txt) to $(cat max_x.txt)"
echo "Sector Y range: $(cat min_y.txt) to $(cat max_y.txt)"

# Check specific sectors (4,6) to (8,10)
echo -e "\nChecking sectors (4,6) to (8,10):"
for x in {4..8}; do
  for y in {6..10}; do
    count=$(grep -c "^ *[0-9]* $x,$y$" sector_counts.txt || echo "0")
    if [ "$count" \!= "0" ]; then
      echo "  Sector ($x,$y): found in list"
    fi
  done
done

# Total pixel count
total=$(echo "$response" | jq '. | length')
echo -e "\nTotal pixels loaded: $total"

# Clean up
rm -f sector_counts.txt min_x.txt max_x.txt min_y.txt max_y.txt
