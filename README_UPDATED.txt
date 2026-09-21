DURGA PUJO NOSTALGIA - UPDATED

1. Open js/main.js
2. Paste your three YouTube Playlist IDs (or full playlist links) here:
   - MAHALAYA
   - PUJO PREM
   - PUJO RADIO

Example:
const playlists = {
  'mahalaya':  { type: 'playlist', listId: 'PLxxxxxxxxxxxx' },
  'pujo-prem': { type: 'playlist', listId: 'PLyyyyyyyyyyyy' },
  'pujo-radio':{ type: 'playlist', listId: 'PLzzzzzzzzzzzz' }
};

3. Put your downloaded Dhak audio at:
   audio/dhak.mp3

4. Top-right icons:
   - User = existing profile
   - Calendar = Puja Nirghonto
   - QR = Kolkata Puja list + QR code

5. Kolkata Puja list URL can be changed in js/main.js:
   const kolkataPujoListUrl = 'https://kolkatakhoj.com/pandals/';

6. The three playlist tabs automatically load the corresponding YouTube playlist.
   The song drawer reads the playlist video IDs and attempts to fetch readable YouTube titles automatically.

Note: Puja timings can vary slightly by Panjika and local puja committee.
