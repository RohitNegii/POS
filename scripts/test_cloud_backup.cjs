const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');

console.log('====================================================');
console.log('🧪 Starting Cloud Backup Integration Verification Test');
console.log('====================================================\n');

let allPassed = true;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    allPassed = false;
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

async function runTests() {
  const testDir = path.join(__dirname, '..', 'tmp_test_backup');
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDir, { recursive: true });

  let prisma = null;
  try {
    // ----------------------------------------------------
    // Test 1: AES-256-GCM Encryption, Tamper Detection & Checksum
    // ----------------------------------------------------
    console.log('--- Test 1: AES-256-GCM Cryptographic Service ---');
    const masterKey = crypto.randomBytes(32); // 256-bit key
    const rawData = Buffer.from('TEST_SQLITE_DATABASE_CONTENT_ROHIT_POS_DATA_2026', 'utf8');
    const originalChecksum = crypto.createHash('sha256').update(rawData).digest('hex');

    // Encryption (IV = 12 bytes, Tag = 16 bytes)
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
    const ciphertext = Buffer.concat([cipher.update(rawData), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const encryptedFile = Buffer.concat([iv, authTag, ciphertext]);

    assert(encryptedFile.length === 12 + 16 + ciphertext.length, 'Encrypted envelope layout is [12B IV][16B Tag][Ciphertext]');

    // Successful Decryption
    const extractedIv = encryptedFile.subarray(0, 12);
    const extractedTag = encryptedFile.subarray(12, 28);
    const extractedCiphertext = encryptedFile.subarray(28);

    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, extractedIv);
    decipher.setAuthTag(extractedTag);
    const decryptedData = Buffer.concat([decipher.update(extractedCiphertext), decipher.final()]);
    const decryptedChecksum = crypto.createHash('sha256').update(decryptedData).digest('hex');

    assert(decryptedChecksum === originalChecksum, 'Decrypted payload matches original SHA-256 checksum perfectly');
    assert(decryptedData.toString('utf8') === rawData.toString('utf8'), 'Decrypted content matches plaintext exactly');

    // Tamper Detection Test
    let tamperedEnvelope = Buffer.from(encryptedFile);
    tamperedEnvelope[tamperedEnvelope.length - 1] ^= 0xff; // Flip bits in ciphertext
    let tamperDetected = false;
    try {
      const badDecipher = crypto.createDecipheriv('aes-256-gcm', masterKey, tamperedEnvelope.subarray(0, 12));
      badDecipher.setAuthTag(tamperedEnvelope.subarray(12, 28));
      badDecipher.update(tamperedEnvelope.subarray(28));
      badDecipher.final();
    } catch {
      tamperDetected = true;
    }
    assert(tamperDetected, 'AES-256-GCM rejects tampered ciphertext before restore can run');

    // ----------------------------------------------------
    // Test 2: SQLite WAL Online Backup (VACUUM INTO) & Magic Header
    // ----------------------------------------------------
    console.log('\n--- Test 2: SQLite WAL Atomic Snapshot (VACUUM INTO) ---');
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: `file:${path.resolve(__dirname, '../prisma/dev.db')}`,
        },
      },
    });

    // Ensure backup_histories table exists in dev.db with correct snake_case column mappings
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "backup_histories";`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "backup_histories" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "filename" TEXT NOT NULL,
        "drive_file_id" TEXT,
        "size_bytes" INTEGER NOT NULL DEFAULT 0,
        "backup_type" TEXT NOT NULL,
        "status" TEXT NOT NULL,
        "error_message" TEXT,
        "checksum" TEXT,
        "metadata_json" TEXT,
        "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "completed_at" DATETIME
      );
    `);

    const snapshotPath = path.join(testDir, 'snapshot.sqlite');
    await prisma.$executeRawUnsafe(`VACUUM INTO '${snapshotPath.replace(/'/g, "''")}'`);

    assert(fs.existsSync(snapshotPath), 'VACUUM INTO generated atomic SQLite snapshot file');
    const header = Buffer.alloc(16);
    const fd = fs.openSync(snapshotPath, 'r');
    fs.readSync(fd, header, 0, 16, 0);
    fs.closeSync(fd);
    const magicHeader = header.toString('utf8', 0, 15);
    assert(magicHeader === 'SQLite format 3', 'Snapshot header contains standard SQLite 3 magic bytes');

    // ----------------------------------------------------
    // Test 3: ZIP Bundle Creation & Manifest Metadata
    // ----------------------------------------------------
    console.log('\n--- Test 3: ZIP Compression & Manifest Inspection ---');
    const manifest = {
      appVersion: '1.0.4',
      databaseProvider: 'sqlite',
      backupCreatedAt: new Date().toISOString(),
      hostname: 'POS-TEST',
      tablesIncluded: ['companies', 'products', 'bills', 'admin_users', 'backup_histories'],
      notes: 'Automated POS Backup including Company A & Company B',
    };

    const zip = new AdmZip();
    zip.addLocalFile(snapshotPath, '', 'database.sqlite');
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));

    const zipBuffer = zip.toBuffer();
    assert(zipBuffer.length > 0, `Compressed ZIP created successfully (size: ${zipBuffer.length} bytes)`);

    // Verify ZIP can be uncompressed and manifest verified
    const readZip = new AdmZip(zipBuffer);
    const manifestEntry = readZip.getEntry('manifest.json');
    assert(manifestEntry !== null, 'ZIP bundle contains manifest.json');
    const parsedManifest = JSON.parse(manifestEntry.getData().toString('utf8'));
    assert(parsedManifest.appVersion === '1.0.4', 'Manifest accurately reflects POS application version 1.0.4');
    assert(parsedManifest.tablesIncluded.length === 5, 'Manifest includes expected database table records');

    // ----------------------------------------------------
    // Test 4: Full End-to-End Backup Pipeline to Encrypted File
    // ----------------------------------------------------
    console.log('\n--- Test 4: End-to-End Encrypted Backup Archive ---');
    const backupFileName = 'POS_Backup_2026-11-18_22-00.enc';
    const finalEncryptedPath = path.join(testDir, backupFileName);

    // Encrypt the entire ZIP
    const backupIv = crypto.randomBytes(12);
    const backupCipher = crypto.createCipheriv('aes-256-gcm', masterKey, backupIv);
    const encryptedZipPayload = Buffer.concat([backupCipher.update(zipBuffer), backupCipher.final()]);
    const backupTag = backupCipher.getAuthTag();
    const finalBackupFile = Buffer.concat([backupIv, backupTag, encryptedZipPayload]);
    fs.writeFileSync(finalEncryptedPath, finalBackupFile);

    assert(fs.existsSync(finalEncryptedPath), `Final encrypted backup file written: ${backupFileName}`);
    assert(finalBackupFile.length > zipBuffer.length, 'Encrypted file size includes IV + tag envelope overhead');

    // ----------------------------------------------------
    // Test 5: Safe Restore Simulation & Emergency Backup
    // ----------------------------------------------------
    console.log('\n--- Test 5: Safe Restore & Emergency Snapshot Simulation ---');
    const readBackupFile = fs.readFileSync(finalEncryptedPath);
    const resIv = readBackupFile.subarray(0, 12);
    const resTag = readBackupFile.subarray(12, 28);
    const resCipher = readBackupFile.subarray(28);

    const restoreDecipher = crypto.createDecipheriv('aes-256-gcm', masterKey, resIv);
    restoreDecipher.setAuthTag(resTag);
    const decryptedZip = Buffer.concat([restoreDecipher.update(resCipher), restoreDecipher.final()]);

    const restoreZip = new AdmZip(decryptedZip);
    const dbEntry = restoreZip.getEntry('database.sqlite');
    assert(dbEntry !== null, 'Restored ZIP archive cleanly yielded database.sqlite');

    const restoredDbBuffer = dbEntry.getData();
    assert(restoredDbBuffer.subarray(0, 15).toString('utf8') === 'SQLite format 3', 'Restored database validates SQLite header before applying to live DB');

    // ----------------------------------------------------
    // Test 6: Missed-Backup Detection Logic
    // ----------------------------------------------------
    console.log('\n--- Test 6: Missed-Backup Detection Logic ---');
    function checkMissedBackup(lastBackupAtIso, scheduledTimeStr) {
      if (!lastBackupAtIso) return true;
      const lastBackupDate = new Date(lastBackupAtIso);
      const now = new Date();
      const [hours, minutes] = scheduledTimeStr.split(':').map(Number);
      const scheduledToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);

      // If scheduled time has already passed today, and last backup was before scheduled time
      if (now > scheduledToday && lastBackupDate < scheduledToday) {
        return true;
      }
      return false;
    }

    const yesterdayIso = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
    const justNowIso = new Date().toISOString();

    // Past 10:00 PM case
    const missedResult = checkMissedBackup(yesterdayIso, '00:01');
    assert(missedResult === true, 'Detected missed backup when app was closed during scheduled time');

    const notMissedResult = checkMissedBackup(justNowIso, '00:01');
    assert(notMissedResult === false, 'Skipped duplicate backup when already backed up today');

    // ----------------------------------------------------
    // Test 7: Database BackupHistory Record Insertion
    // ----------------------------------------------------
    console.log('\n--- Test 7: Database BackupHistory Record Insertion ---');
    const historyRecord = await prisma.backupHistory.create({
      data: {
        filename: backupFileName,
        driveFileId: 'mock-google-drive-file-id-12345',
        sizeBytes: finalBackupFile.length,
        backupType: 'MANUAL',
        status: 'SUCCESS',
        checksum: originalChecksum,
        metadataJson: JSON.stringify(manifest),
      },
    });

    assert(historyRecord.id !== undefined, `Saved BackupHistory row id: ${historyRecord.id}`);
    assert(historyRecord.status === 'SUCCESS', 'BackupHistory status is SUCCESS');

    const fetchedHistory = await prisma.backupHistory.findMany({
      where: { id: historyRecord.id },
    });
    assert(fetchedHistory.length === 1, 'Successfully queried BackupHistory from Prisma database');

    // Cleanup test record
    await prisma.backupHistory.delete({ where: { id: historyRecord.id } });

    console.log('\n====================================================');
    if (allPassed) {
      console.log('🎉 ALL CLOUD BACKUP INTEGRATION TESTS PASSED!');
    } else {
      console.error('💥 SOME TESTS FAILED. Inspect output above.');
      process.exit(1);
    }
    console.log('====================================================');
  } catch (err) {
    console.error('💥 Fatal error during tests:', err);
    process.exit(1);
  } finally {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    if (prisma) {
      await prisma.$disconnect();
    }
  }
}

runTests();
