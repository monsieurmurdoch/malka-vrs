#import "Dropbox.h"

@implementation Dropbox

+ (void)setAppKey {
    // Dropbox integration is optional for Malka/Maple mobile builds.
}

+ (BOOL)application:(UIApplication *)application
            openURL:(NSURL *)url
            options:(NSDictionary<UIApplicationOpenURLOptionsKey, id> *)options {
    return NO;
}

@end
