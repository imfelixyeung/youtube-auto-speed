OUT_DIR := dist
SRC := src/background.ts
ZIP := youtube-auto-speed.zip

.PHONY: build typecheck clean zip

build:
	bun build $(SRC) --outdir=$(OUT_DIR) --target=browser

typecheck:
	bunx tsc --noEmit

zip: | build
	zip -r $(ZIP) manifest.json $(OUT_DIR)

clean:
	rm -rf $(OUT_DIR) $(ZIP)
