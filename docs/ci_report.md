# CI báo cáo: pipeline Android (GitHub Actions)

## 1. Công cụ portable (không cài đặt, không đổi PATH)

| Công cụ | Đường dẫn | Phiên bản | Kiểm tra |
| --- | --- | --- | --- |
| MinGit 64-bit | `D:\tools\mingit\cmd\git.exe` | 2.56.1.windows.1 | `git version 2.56.1.windows.1` |
| GitHub CLI | `D:\tools\gh\bin\gh.exe` | 2.105.0 | `gh version 2.105.0` |

Tổng dung lượng `D:\tools\`: **131.7 MB** (dưới mục tiêu 150 MB). Các file zip đã xóa.

## 2. Đã tạo / sửa

- `android/` tạo bằng `npx cap add android` (Capacitor 8, plugin: app 8.1.2, filesystem 8.1.5, share 8.0.3).
- `android/app/src/main/AndroidManifest.xml`: thêm `android:usesCleartextTraffic="true"` vào `<application>`. Giữ quyền INTERNET.
- `android/app/build.gradle` (Groovy): versionCode/versionName theo env, `signingConfigs.release` đọc từ env, gán cho `buildTypes.release` chỉ khi có `ANDROID_KEYSTORE_PATH`.
- `android/.gitignore` (do Capacitor sinh) đã có `build/`, `.gradle/`, `app/src/main/assets/public`. Không sửa `.gitignore` gốc.
- `tools/make_keystore.py`: tạo keystore.
- `.github/workflows/android.yml`: workflow build.

Đoạn Gradle đã thêm (trong `android { ... }`):

```groovy
    defaultConfig {
        ...
        def versionCodeValue = (System.getenv('VERSION_CODE') ?: '1').toInteger()
        versionCode versionCodeValue
        versionName "0.1." + versionCodeValue
        ...
    }
    signingConfigs {
        release {
            if (System.getenv('ANDROID_KEYSTORE_PATH')) {
                storeFile file(System.getenv('ANDROID_KEYSTORE_PATH'))
                storeType "pkcs12"
                storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
                keyAlias System.getenv('ANDROID_KEY_ALIAS')
                keyPassword System.getenv('ANDROID_KEY_PASSWORD')
            }
        }
    }
    buildTypes {
        release {
            if (System.getenv('ANDROID_KEYSTORE_PATH')) {
                signingConfig signingConfigs.release
            }
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
```

Chưa chạy Gradle build cục bộ (chưa có Android SDK trên máy). Lỗi build sẽ lộ ở lần chạy CI đầu tiên.

## 3. Keystore

- File: `.secrets\release.p12` (PKCS#12, alias `docsongngu`, RSA-2048, tự ký, CN=DocSongNgu, O=Personal, 30 năm).
- Mật khẩu và alias nằm trong `.secrets\keystore.txt` (thư mục `.secrets/` đã được `.gitignore`). Không ghi mật khẩu ra chỗ nào khác.
- SHA-256 chứng chỉ: `63:1C:29:84:5B:16:D9:DC:2B:05:D4:33:EA:FF:C5:22:24:1C:49:C9:9C:28:80:A0:42:33:70:E8:60:F2:65:5E`
- Đã kiểm tra: load lại bằng `pkcs12.load_key_and_certificates` thành công.
- Không chạy lại script khi đã có `release.p12` (script từ chối ghi đè). Muốn tạo mới thì xóa file thủ công, nhưng khi đó APK mới sẽ khác chữ ký với bản cũ.

## 4. Workflow `.github/workflows/android.yml`

- Trigger: push `main`, `workflow_dispatch`. Quyền: `contents: write`. Runner: ubuntu-latest.
- Các bước: checkout@v4 → setup-node@v4 (node 22, cache npm) → `npm ci` → `npm run vendor` → `npx cap sync android` → setup-java@v4 (temurin 21) → setup-android@v3 → giải mã secret `ANDROID_KEYSTORE_B64` ra `$RUNNER_TEMP/release.p12` và export 4 biến ANDROID_* cùng `VERSION_CODE=${{ github.run_number }}` qua `GITHUB_ENV` → `./gradlew assembleRelease --no-daemon` → copy thành `DocSongNgu-b<run_number>.apk` → kiểm tra kích thước (> 30 MB thì fail) → `apksigner verify --print-certs` (build-tools mới nhất) và in SHA-256 → upload-artifact@v4 → softprops/action-gh-release@v2 tạo release tag `b<run_number>` kèm APK.
- Đã kiểm tra cú pháp YAML (parse được, đủ các bước). Chưa chạy thật trên GitHub.

## 5. Secrets cần đặt trên GitHub

Tên secret bắt buộc: `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

## 6. Lệnh PowerShell dùng sau này (chạy trong thư mục `d:\app doc van ban`)

Đăng nhập GitHub (mở trình duyệt):

```powershell
D:\tools\gh\bin\gh.exe auth login --web --git-protocol https
D:\tools\gh\bin\gh.exe auth setup-git
```

Cấu hình danh tính git cho repo (lấy từ tài khoản GitHub):

```powershell
$u = D:\tools\gh\bin\gh.exe api user | ConvertFrom-Json
D:\tools\mingit\cmd\git.exe config user.name $u.login
D:\tools\mingit\cmd\git.exe config user.email "$($u.id)+$($u.login)@users.noreply.github.com"
```

Tạo repo, commit, đẩy lên:

```powershell
D:\tools\mingit\cmd\git.exe init -b main
D:\tools\mingit\cmd\git.exe add -A
D:\tools\mingit\cmd\git.exe commit -m "Initial commit: Android pipeline"
D:\tools\gh\bin\gh.exe repo create doc-song-ngu --private --source . --remote origin --push
```

Đặt 4 secret (mật khẩu và alias đọc từ `.secrets\keystore.txt`, không in ra màn hình):

```powershell
$kv = @{}
Get-Content .secrets\keystore.txt -Encoding UTF8 | ForEach-Object { if ($_ -match '^(password|alias): (.*)$') { $kv[$matches[1]] = $matches[2].Trim() } }
[Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path .secrets\release.p12))) | D:\tools\gh\bin\gh.exe secret set ANDROID_KEYSTORE_B64
$kv['password'] | D:\tools\gh\bin\gh.exe secret set ANDROID_KEYSTORE_PASSWORD
$kv['alias']    | D:\tools\gh\bin\gh.exe secret set ANDROID_KEY_ALIAS
$kv['password'] | D:\tools\gh\bin\gh.exe secret set ANDROID_KEY_PASSWORD
```

Theo dõi lần chạy và tải APK:

```powershell
D:\tools\gh\bin\gh.exe run watch
D:\tools\gh\bin\gh.exe release download b1 --pattern "*.apk" --dir "d:\app doc van ban\dist"
```

Thay `b1` bằng tag thực tế (xem `D:\tools\gh\bin\gh.exe release list`).

## 7. Việc còn lại / rủi ro

- Chưa đăng nhập GitHub, chưa tạo repo, chưa push (theo yêu cầu).
- Chưa chạy Gradle cục bộ. Cần kiểm tra ở lần CI đầu.
- `web/` và `tools/vendor.mjs` do Codex viết; `npm run vendor` và `cap sync` phụ thuộc vào đó.
- Keystore tự ký, dùng cho cài đặt sideload. Muốn lên Play Store thì cần cân nhắc thêm.
