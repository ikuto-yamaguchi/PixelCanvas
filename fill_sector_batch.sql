-- Clear existing pixels first
DELETE FROM public.pixels;

-- Create a simple checkerboard pattern in sector (0,0)
INSERT INTO public.pixels (id, x, y, color, owner_id, timestamp, sector_x, sector_y, unlocked)
SELECT 
    gen_random_uuid(),
    x.val,
    y.val,
    CASE 
        WHEN (x.val / 8 + y.val / 8) % 2 = 0 THEN '#FF0000'  -- Red
        ELSE '#00FF00'  -- Green
    END as color,
    'system',
    NOW(),
    0,
    0,
    true
FROM generate_series(0, 255) AS x(val)
CROSS JOIN generate_series(0, 255) AS y(val);