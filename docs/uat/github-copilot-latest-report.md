# UAT: GitHub Copilot Latest Report Card

## Goal

Verify that the dashboard renders the latest GitHub Copilot 28-day users report metadata for the target organization.

## Prerequisites

- Dependencies installed with `npm install`
- Seeded metadata present at `public/data/github-copilot/latest-metadata.json`
- Local dashboard running with `npm run dev`

## Steps

1. Open the local dashboard in a browser.
2. Confirm the landing section mentions GitHub Copilot as the first provider slice.
3. Confirm the report card shows organization `kdtix-open`.
4. Confirm the date window matches the seeded metadata file.
5. Confirm the download count matches the number of `download_links` in the seeded metadata file.

## Expected result

The page displays a GitHub Copilot report card with the correct organization, 28-day date window, and signed download count derived from the latest metadata snapshot.
