-- M43 Scholarship Finder integrity: keep direct database writes aligned with
-- the public API's source-verification and bounded-text contract.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scholarships_title_length_ck') THEN
    ALTER TABLE scholarships ADD CONSTRAINT scholarships_title_length_ck CHECK (char_length(title) BETWEEN 1 AND 240);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scholarships_provider_length_ck') THEN
    ALTER TABLE scholarships ADD CONSTRAINT scholarships_provider_length_ck CHECK (char_length(provider) BETWEEN 1 AND 160);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scholarships_source_url_https_ck') THEN
    ALTER TABLE scholarships ADD CONSTRAINT scholarships_source_url_https_ck CHECK (source_url IS NULL OR source_url ~ '^https://');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scholarships_source_url_length_ck') THEN
    ALTER TABLE scholarships ADD CONSTRAINT scholarships_source_url_length_ck CHECK (source_url IS NULL OR char_length(source_url) <= 1000);
  END IF;
END $$;
