-- Fill first 100x100 pixels in sector (0,0)
INSERT INTO public.pixels (id, x, y, color, owner_id, timestamp, sector_x, sector_y, unlocked)
SELECT 
    gen_random_uuid(),
    x.val,
    y.val,
    '#' || 
    LPAD(TO_HEX(LEAST(255, x.val * 2))::text, 2, '0') ||
    LPAD(TO_HEX(LEAST(255, y.val * 2))::text, 2, '0') ||
    '80',
    'system',
    NOW(),
    0,
    0,
    true
FROM generate_series(0, 99) AS x(val)
CROSS JOIN generate_series(0, 99) AS y(val);