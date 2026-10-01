# German dictionary source (GPL compliance)

PathScribe ships the German Hunspell dictionary (igerman98, © Björn Jacke, via the
`dictionary-de` package) unmodified under the GNU GPL version 2 or 3.

To ship the complete corresponding source alongside it (GPL-2.0 §3(a) / GPL-3.0 §6(a)),
place the upstream source archive in this folder, for example
`igerman98-20161207.tar.bz2` from https://www.j3e.de/ispell/igerman98/ . The files in
`node_modules/dictionary-de/` come from https://github.com/wooorm/dictionaries
(`dictionaries/de`), which generates them from that archive; a copy of that folder's
build notes can go here too.

`npm run spellcheck:build` copies everything in this folder except this README to
`public/spellcheck/source/de-DE/` and lists it in `public/spellcheck/NOTICE.txt`.
While the folder is empty, NOTICE.txt carries the GPL written offer instead, using the
contact in `spellcheck-data/licenses/source-offer-contact.txt`.
