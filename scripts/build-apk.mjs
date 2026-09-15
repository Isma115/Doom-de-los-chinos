// Compila el APK debug eligiendo un JDK >= 21.
// Capacitor 7 exige Java 21+ y el ~/.gradle/gradle.properties del equipo
// puede fijar org.gradle.java.home a Java 17: por eso se pasa por CLI.
import { execSync, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

function javaMajor(javaBin) {
  try {
    // `java -version` escribe en stderr: se redirige a stdout.
    const text = execSync(`"${javaBin}" -version 2>&1`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const m = String(text).match(/version "(\d+)/);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

function checkHome(home) {
  if (!home) return null;
  const javaBin = join(home, 'bin', 'java');
  if (!existsSync(javaBin)) return null;
  const major = javaMajor(javaBin);
  console.log(`[mobile-apk] Candidato ${home} -> Java ${major ?? 'desconocida'}`);
  return major !== null && major >= 21 ? { home, major } : null;
}

const candidates = [
  process.env.JAVA_HOME,
  '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home',
  '/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home'
].filter(Boolean);

let best = null;
for (const candidate of candidates) {
  const hit = checkHome(candidate);
  if (hit && (!best || hit.major > best.major)) best = hit;
}

if (!best) {
  try {
    const out = execFileSync('/usr/libexec/java_home', ['-v', '21'], {
      encoding: 'utf8'
    }).trim();
    best = checkHome(out);
  } catch {
    best = null;
  }
}

if (!best) {
  console.error(
    '[mobile-apk] ERROR: se necesita un JDK 21 o superior y no se encontró ninguno.\n' +
      'Instálalo con: brew install openjdk@21'
  );
  process.exit(1);
}

console.log(`[mobile-apk] Usando JDK: ${best.home}`);
execFileSync('./android/gradlew', ['-p', 'android', `-Dorg.gradle.java.home=${best.home}`, 'assembleDebug'], {
  stdio: 'inherit'
});
console.log(
  '[mobile-apk] APK en android/app/build/outputs/apk/debug/app-debug.apk'
);
