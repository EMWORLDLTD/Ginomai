'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const sanctuaryMedia = require('../lib/sanctuary-media')();
const softwareMigrator = require('../lib/software-migrator')(sanctuaryMedia);

test('Software Migrator - Relaxed JSON parser handles VideoPsalm unquoted keys and BOM', () => {
  const testInput = '\uFEFF{Abbreviation:"TEST",Songs:[{Guid:"abc123",Text:"Amazing Grace\n",Verses:[{ID:1,Text:"Amazing grace how sweet the sound\nThat saved a wretch like me"},{Tag:1,ID:2,Text:"[G]Hallelujah [C]praise the Lord"}]}]}';
  const parsed = softwareMigrator.parseVideoPsalmRelaxedJson(testInput);
  
  assert.ok(parsed, 'Parsed object should not be null');
  assert.equal(parsed.Abbreviation, 'TEST');
  assert.equal(parsed.Songs.length, 1);
  assert.equal(parsed.Songs[0].Verses.length, 2);
  assert.equal(parsed.Songs[0].Verses[1].Tag, 1);
});

test('Software Migrator - Convert VideoPsalm song cleans chords and tags', () => {
  const rawSong = {
    Text: 'Above All Powers\n',
    Author: 'Paul Baloche & Lenny LeBlanc',
    Verses: [
      { ID: 1, Text: '[G/B]Above all [C]powers, [D]above all [G]kings' },
      { Tag: 1, ID: 0, Text: '[G]Crucified, laid [C]behind a [G]stone' }
    ]
  };

  const converted = softwareMigrator.convertVideoPsalmSong(rawSong, 'Worship Collection');

  assert.equal(converted.title, 'Above All Powers');
  assert.equal(converted.author, 'Paul Baloche & Lenny LeBlanc');
  assert.equal(converted.songbook, 'Worship Collection');
  assert.equal(converted.stanzas.length, 2);
  assert.equal(converted.stanzas[0].type, 'Verse 1');
  assert.equal(converted.stanzas[0].text, 'Above all powers, above all kings');
  assert.equal(converted.stanzas[1].type, 'Chorus');
  assert.equal(converted.stanzas[1].text, 'Crucified, laid behind a stone');
});

test('Software Migrator - Scan directory identifies VideoPsalm components', async () => {
  const sampleDir = '/Users/corpine/Downloads/Blip/VideoPsalm';
  if (!fs.existsSync(sampleDir)) return; // Skip if directory not on machine

  const result = await softwareMigrator.scan(sampleDir);

  assert.equal(result.success, true);
  assert.equal(result.softwareType, 'videopsalm');
  assert.equal(result.counts.songs, 533);
  assert.equal(result.counts.bibles, 3);
  assert.equal(result.counts.videos, 16);
  assert.equal(result.counts.images, 40);
  assert.equal(result.counts.agendas, 2);
});

test('Software Migrator - Execute migration returns structured songs, agendas, and bibles', async () => {
  const sampleDir = '/Users/corpine/Downloads/Blip/VideoPsalm';
  if (!fs.existsSync(sampleDir)) return;

  const result = await softwareMigrator.execute({
    folderPath: sampleDir,
    importSongs: true,
    importBibles: true,
    importMedia: true,
    importAgendas: true
  });

  assert.equal(result.success, true);
  assert.equal(result.softwareType, 'videopsalm');
  assert.equal(result.importedCounts.songs, 533);
  assert.equal(result.importedCounts.bibles, 3);
  assert.equal(result.importedCounts.agendas, 2);
  assert.ok(result.songs.length >= 533);
  assert.ok(result.agendas.length >= 1);
  assert.ok(result.mediaItems.length > 0);
  assert.equal(result.bibles.length, 3);
  const bibleCodes = result.bibles.map(b => b.code);
  assert.ok(bibleCodes.includes('KJV'), 'Should include KJV Bible');
  assert.ok(bibleCodes.includes('NKJV'), 'Should include NKJV Bible');
  assert.ok(bibleCodes.includes('NLT'), 'Should include NLT Bible');
  assert.ok(result.bibles.every(b => b.availableInGnomia === true), 'All 3 translations should be marked availableInGnomia');
});
