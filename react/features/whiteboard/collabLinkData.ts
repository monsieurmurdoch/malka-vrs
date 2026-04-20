const ROOM_ID_LENGTH = 22;
const ROOM_KEY_LENGTH = 22;
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

const getRandomValues = (size: number): Uint8Array => {
    const randomValues = new Uint8Array(size);

    window.crypto.getRandomValues(randomValues);

    return randomValues;
};

const randomToken = (length: number): string => {
    const randomValues = getRandomValues(length);
    let value = '';

    for (let index = 0; index < randomValues.length; index++) {
        value += ALPHABET[randomValues[index] % ALPHABET.length];
    }

    return value;
};

export interface ICollaborationLinkData {
    roomId: string;
    roomKey: string;
}

/**
 * Generates local whiteboard collaboration credentials without loading the
 * heavy Excalidraw bundle during app bootstrap.
 *
 * @returns {ICollaborationLinkData}
 */
export const generateCollaborationLinkData = (): ICollaborationLinkData => ({
    roomId: randomToken(ROOM_ID_LENGTH),
    roomKey: randomToken(ROOM_KEY_LENGTH)
});
