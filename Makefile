OUT_DIR := dist
SRC := src/content.ts src/interceptor.ts src/popup.html
ZIP := youtube-auto-speed.zip

.PHONY: build typecheck test clean zip

build: clean
	bunx @tailwindcss/cli -i src/popup.css -o dist/popup.css
	bun build $(SRC) --outdir=$(OUT_DIR) --target=browser --minify --sourcemap=linked

typecheck:
	bunx tsc --noEmit

test:
	bunx tsc --noEmit -p tsconfig.test.json
	bun test src

zip: | build
	zip -r $(ZIP) manifest.json $(OUT_DIR)

clean:
	rm -rf $(OUT_DIR) $(ZIP)
