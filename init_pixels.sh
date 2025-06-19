#!/bin/bash

# Delete all pixels
echo "Deleting all pixels..."
curl -X POST \
  -H "Authorization: Bearer sbp_015b2158d74b1624eec097e0d445b207cd5ebf04" \
  -H "Content-Type: application/json" \
  -d '{"query": "DELETE FROM public.pixels;"}' \
  https://api.supabase.com/v1/projects/lgvjdefkyeuvquzckkvb/database/query

echo -e "\n\nFilling sector (0,0) with pixels..."

# Create 256x256 pixels in batches of 1000
for batch in {0..65}; do
  start=$((batch * 1000))
  
  # Build query for this batch
  query="INSERT INTO public.pixels (id, x, y, color, owner_id, timestamp, sector_x, sector_y, unlocked) VALUES "
  
  for i in {0..999}; do
    pixel_num=$((start + i))
    if [ $pixel_num -ge 65536 ]; then
      break
    fi
    
    x=$((pixel_num % 256))
    y=$((pixel_num / 256))
    
    # Create color pattern
    if [ $(( (x/16 + y/16) % 2 )) -eq 0 ]; then
      color="#4CAF50"  # Green
    else
      color="#2196F3"  # Blue
    fi
    
    if [ $i -gt 0 ]; then
      query="$query, "
    fi
    
    query="$query (gen_random_uuid(), $x, $y, '$color', 'system', NOW(), 0, 0, true)"
  done
  
  query="$query;"
  
  echo "Inserting batch $batch (pixels $start to $((start+999)))..."
  
  # Execute the batch insert
  curl -X POST \
    -H "Authorization: Bearer sbp_015b2158d74b1624eec097e0d445b207cd5ebf04" \
    -H "Content-Type: application/json" \
    -d "{\"query\": \"$query\"}" \
    https://api.supabase.com/v1/projects/lgvjdefkyeuvquzckkvb/database/query
  
  echo -e "\n"
  
  # Small delay to avoid rate limiting
  sleep 0.5
done

echo "Completed! Filled sector (0,0) with 65,536 pixels."