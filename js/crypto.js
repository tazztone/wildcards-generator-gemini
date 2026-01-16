// Key for symmetric encryption. Stored in memory.
let key = null;

// Function to get the encryption key
async function getKey() {
    // If the key is already in memory, return it
    if (key) {
        return key;
    }

    // Get the key from IndexedDB
    const storedKey = await getKeyFromDB();
    if (storedKey) {
        key = storedKey;
        return key;
    }

    // If no key is stored, generate a new one
    key = await crypto.subtle.generateKey(
        {
            name: "AES-GCM",
            length: 256,
        },
        true,
        ["encrypt", "decrypt"]
    );

    // Store the new key in IndexedDB
    await setKeyInDB(key);

    return key;
}

// Function to encrypt data
export async function encrypt(data) {
    // If there is no data, return null
    if (!data) {
        return null;
    }

    // Get the encryption key
    const encryptionKey = await getKey();

    // Create a new initialization vector for each encryption
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Encode the data to be encrypted
    const encodedData = new TextEncoder().encode(data);

    // Encrypt the data
    const encryptedData = await crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv,
        },
        encryptionKey,
        encodedData
    );

    // Return the encrypted data and the initialization vector
    return {
        encrypted: encryptedData,
        iv: iv,
    };
}

// Function to decrypt data
export async function decrypt(encryptedData) {
    // If there is no encrypted data, return null
    if (!encryptedData) {
        return null;
    }

    // Get the encryption key
    const decryptionKey = await getKey();

    // Decrypt the data
    try {
        const decrypted = await crypto.subtle.decrypt(
            {
                name: "AES-GCM",
                iv: encryptedData.iv,
            },
            decryptionKey,
            encryptedData.encrypted
        );

        // Decode and return the decrypted data
        return new TextDecoder().decode(decrypted);
    } catch (error) {
        // If decryption fails, clear the stored key and log the error
        await clearKeyFromDB();
        return null;
    }
}

// Function to open the database
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("CryptoDB", 1);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            db.createObjectStore("keys", { keyPath: "id" });
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };

        request.onerror = (event) => {
            reject(event.target.error);
        };
    });
}

// Function to get the key from the database
async function getKeyFromDB() {
    const db = await openDB();
    const transaction = db.transaction("keys", "readonly");
    const store = transaction.objectStore("keys");
    const request = store.get("encryptionKey");

    return new Promise((resolve) => {
        request.onsuccess = (event) => {
            resolve(event.target.result ? event.target.result.key : null);
        };
        request.onerror = () => resolve(null);
    });
}

// Function to set the key in the database
async function setKeyInDB(key) {
    const db = await openDB();
    const transaction = db.transaction("keys", "readwrite");
    const store = transaction.objectStore("keys");
    store.put({ id: "encryptionKey", key: key });
}

// Function to clear the key from the database
async function clearKeyFromDB() {
    const db = await openDB();
    const transaction = db.transaction("keys", "readwrite");
    const store = transaction.objectStore("keys");
    store.delete("encryptionKey");
    key = null; // Also clear the in-memory key
}
