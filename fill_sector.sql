-- Fill sector (0,0) with rainbow gradient pattern
DO $$
DECLARE
    x INT;
    y INT;
    hue INT;
    r INT;
    g INT;
    b INT;
    color_hex TEXT;
BEGIN
    -- Clear existing pixels
    DELETE FROM public.pixels;
    
    -- Fill sector (0,0) - 256x256 pixels
    FOR x IN 0..255 LOOP
        FOR y IN 0..255 LOOP
            -- Create rainbow gradient based on position
            hue := ((x + y) * 360 / 512) % 360;
            
            -- Simple HSV to RGB conversion (S=1, V=1)
            IF hue < 60 THEN
                r := 255;
                g := (hue * 255 / 60)::INT;
                b := 0;
            ELSIF hue < 120 THEN
                r := ((120 - hue) * 255 / 60)::INT;
                g := 255;
                b := 0;
            ELSIF hue < 180 THEN
                r := 0;
                g := 255;
                b := ((hue - 120) * 255 / 60)::INT;
            ELSIF hue < 240 THEN
                r := 0;
                g := ((240 - hue) * 255 / 60)::INT;
                b := 255;
            ELSIF hue < 300 THEN
                r := ((hue - 240) * 255 / 60)::INT;
                g := 0;
                b := 255;
            ELSE
                r := 255;
                g := 0;
                b := ((360 - hue) * 255 / 60)::INT;
            END IF;
            
            -- Convert to hex color
            color_hex := '#' || LPAD(TO_HEX(r), 2, '0') || 
                              LPAD(TO_HEX(g), 2, '0') || 
                              LPAD(TO_HEX(b), 2, '0');
            
            -- Insert pixel
            INSERT INTO public.pixels (
                id, x, y, color, owner_id, timestamp, sector_x, sector_y, unlocked
            ) VALUES (
                gen_random_uuid(),
                x, y,
                color_hex,
                'system',
                NOW(),
                0, 0,
                true
            );
        END LOOP;
        
        -- Log progress every 16 rows
        IF x % 16 = 0 THEN
            RAISE NOTICE 'Progress: % / 256 rows completed', x;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Successfully filled sector (0,0) with 65,536 pixels';
END $$;