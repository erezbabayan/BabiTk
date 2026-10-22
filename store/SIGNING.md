# חתימת APK לפרסום

ה-keystore לא נשמר בגיט. יוצרים אותו פעם אחת במחשב, ושומרים רק ב-GitHub Secrets.

```bash
keytool -genkeypair -v \
  -storetype PKCS12 \
  -keystore babitk-release.keystore \
  -alias babitk \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

אחר כך, בלי להדפיס את הערכים לצ'אט או לקומיט:

```bash
base64 -w 0 babitk-release.keystore
```

ב-GitHub: Settings → Secrets and variables → Actions → New repository secret.

| שם | ערך |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | פלט ה-base64 של קובץ ה-keystore |
| `ANDROID_KEYSTORE_PASSWORD` | סיסמת ה-keystore |
| `ANDROID_KEY_ALIAS` | `babitk`, אלא אם בחרתם alias אחר |
| `ANDROID_KEY_PASSWORD` | סיסמת המפתח. ב-PKCS12 היא לרוב זהה לסיסמת ה-keystore |

מוחקים את `babitk-release.keystore` מהמחשב אחרי שהסוד נשמר, או שומרים אותו במקום פרטי. בלי הקובץ הזה אי אפשר לעדכן את אותה אפליקציה מותקנת.

הזרימה `.github/workflows/android-release.yml` רצה בדחיפה ל-`main` או בתגית `v*`. היא בונה APK ו-AAB מקומית עם Gradle, בלי שירות בתשלום. ה-APK מתפרסם כנכס `BabiTk.apk` ב-release האחרון:

https://github.com/erezbabayan/BabiTk/releases/latest/download/BabiTk.apk

ה-AAB נשמר כ-artifact של הריצה (`BabiTk-aab`) ולא עולה ל-Play Console.
