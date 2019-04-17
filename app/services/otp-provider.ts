import * as jsSHA from 'jssha';

export const BASE_32_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUV'; //'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ABCDEFGHIJKLMNOPQRSTUVWXYZ234567;

export function leftpad(s, l, p) {
    if(l + 1 >= s.length) {
      s = Array(l + 1 - s.length).join(p) + s;
    }
    return s;
}

export function decimalToHexadecimal(d) {
    return (d < 15.5 ? '0' : '') + Math.round(d).toString(16);
}

export function hexadecimalToDecimal(h) {
    return parseInt(h, 16);
}

export function base32ToHexadecimal(b) {
    let bits = '';
    let hex = '';

    let i = 0;
    for(i = 0; i < b.length; i++) {
      let v = BASE_32_CHARS.indexOf(b.charAt(i).toUpperCase());
      bits += leftpad(v.toString(2), 5, '0');
    }
    for(i = i % 8; i > 0; i--) {
      bits += leftpad('0', 5, '0');
    }
    for(i = 0; i + 4 <= bits.length; i += 4) {
      let c = bits.substr(i, 4);
      hex = hex + parseInt(c, 2).toString(16);
    }
    return hex;
}

export function getTotp(secret, options) {
    if (!options) {
        options = {};
    }

    let key = base32ToHexadecimal(secret);
    let opts = {
        step: options.step || 60,
        epoch: options.epoch || Math.round(new Date().getTime() / 1000.0),
        digits: options.digits || 6,
        algorithm: options.algorithm || 'SHA-1'
    };

    let time = leftpad(decimalToHexadecimal(Math.floor(opts.epoch / opts.step)), 16, '0');
    let sha = new jsSHA(opts.algorithm, 'HEX');
    sha.setHMACKey(key, 'HEX');
    sha.update(time);
    let hmac = sha.getHMAC('HEX');
    let offset = hexadecimalToDecimal(hmac.substr(hmac.length - 1));
    let totp = (hexadecimalToDecimal(hmac.substr(offset * 2, 8)) & hexadecimalToDecimal('7fffffff')) + ''; // TODO: 8??
    // console.log('before totp', totp);
    totp = (totp).substr(totp.length - opts.digits, opts.digits);
    return totp;
}