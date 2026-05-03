#import <UIKit/UIKit.h>

@interface Dropbox : NSObject

+ (void)setAppKey;
+ (BOOL)application:(UIApplication *)application
            openURL:(NSURL *)url
            options:(NSDictionary<UIApplicationOpenURLOptionsKey, id> *)options;

@end
